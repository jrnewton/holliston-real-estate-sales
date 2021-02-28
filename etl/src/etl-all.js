'use strict';

//see main() function for documentation

const debug = require('debug')('etl:debug');
const verbose = require('debug')('etl:verbose');

const Stream = require('stream');
const Axios = require('axios');
const $ = require('cheerio');

const suffixUtil = require('street-suffix');

const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

const {
  TextractClient,
  DetectDocumentTextCommand
} = require('@aws-sdk/client-textract');

const getErrorMessage = (fn, url, error) => {
  let msg = `getPageList fetch of ${url} returned`;

  if (error.message) {
    msg += ` ${error.status} (${error.statusText})`;
  } else {
    msg += JSON.stringify(error);
  }

  return msg;
};

const getTextFromImage = async (bucket, key) => {
  debug('[getTextFromImage]', bucket, key);

  const client = new TextractClient({ region: REGION });

  const params = {
    Document: {
      S3Object: {
        Bucket: bucket,
        Name: key
      }
    }
  };

  const textractObject = await client.send(
    new DetectDocumentTextCommand(params)
  );

  verbose('textract output', textractObject);
  return textractObject;
};

const getLineData = (textractObject) => {
  debug('[getLineData]');

  let results = [];
  for (const block of textractObject.Blocks) {
    if (block.BlockType === 'LINE') {
      //The two fields I care about from block:
      //"Confidence": 99.75230407714844,
      //"Text": "90 Rolling Meadow Dr $735,000",
      let { Confidence: c, Text: t } = block;
      if (c < 95) {
        console.warn('low confidence', c, 'for line text', t);
      }
      results.push(t);
    }
  }

  debug('raw text array length', results.length);
  verbose('text array', JSON.stringify(results));

  return results;
};

const getRecords = (textItems, monthName, year, imageUrl) => {
  debug('[getRecords]', monthName, year, imageUrl);

  const getPriceAsNumber = (priceString) => {
    return priceString.replace(/[^0-9]/g, '');
  };

  const createRecord = () => {
    return {
      sourceUrl: '',
      monthName: '',
      month: '',
      year: '',
      address: {
        streetNumber: '',
        streetName: '',
        streetSuffix: '',
        unit: '',
        townName: '',
        stateName: '',
        zipCode: ''
      },
      price: '',
      seller: '',
      buyer: ''
    };
  };

  //map names to numbers, as strings in order to keep leading zeros (which means good lexigraphical order).
  const monthNumberLookup = {
    JANUARY: '01',
    FEBRUARY: '02',
    MARCH: '03',
    APRIL: '04',
    MAY: '05',
    JUNE: '06',
    JULY: '07',
    AUGUST: '08',
    SEPTEMBER: '09',
    OCTOBER: '10',
    NOVEMBER: '11',
    DECEMBER: '12'
  };

  const getMonthNumber = (monthName) => {
    return monthNumberLookup[monthName.toUpperCase()] || monthName;
  };

  const records = [];

  let record = createRecord();

  let state = 0;

  for (let item of textItems) {
    item = item.trim();

    //0 = need address
    if (state === 0) {
      //Start of line is always an address.
      //if the address is long then AWS textract seems to not
      //split the price into a new line.

      let foundPrice = false;
      if (item.indexOf('$') !== -1) {
        let [streetNumAndName, price] = item.split('$');
        item = streetNumAndName.trim();
        record.price = getPriceAsNumber(price);
        foundPrice = true;
      }

      const addressMatch = item.match(
        // /^([0-9]+) ([a-zA-Z ]+) ([a-zA-Z]+)[ ]?[$]?([0-9,]+)?/
        /^([0-9]+) ([a-zA-Z ]+) ([a-zA-Z]+)( [Uu]nit [0-9]+)?$/
      );

      if (addressMatch) {
        debug('address match', addressMatch);
        record.address.streetNumber = addressMatch[1].trim();
        record.address.streetName = addressMatch[2].trim();
        record.address.streetSuffix = addressMatch[3].trim();
        if (addressMatch.length > 4 && addressMatch[4]) {
          record.address.unit = addressMatch[4].trim();
        }
      }

      //bash in town state zip :)
      record.address.townName = 'Holliston';
      record.address.stateName = 'MA';
      record.address.zipCode = '01746';

      state++;

      if (foundPrice) {
        state++;
      }
    }
    //1 = need price
    else if (state === 1) {
      record.price = getPriceAsNumber(item);
      state++;
    }
    //2 = need seller label
    else if (state === 2) {
      if (item.toUpperCase() === 'SELLER') {
        state++;
      }
    }
    //3 = need seller
    else if (state === 3) {
      record.seller = item.trim();
      state++;
    }
    //4 = need buyer label
    else if (state === 4) {
      if (item.toUpperCase() === 'BUYER') {
        state++;
      }
    }
    //5 = need buyer
    else if (state === 5) {
      record.buyer = item.trim();

      record.monthName = monthName;
      record.month = getMonthNumber(monthName);
      record.year = year;
      record.sourceUrl = imageUrl;

      records.push(record);

      //reset
      record = createRecord();
      state = 0;
    } else {
      throw new Error('unsupported state: ' + state + '. Item = ' + item);
    }
  }

  debug('# of records', records.length);
  verbose('records', records);

  return records;
};

const putItem = async (dbClient, record, dryrun = false) => {
  debug('[putItem]', record.year, record.month, JSON.stringify(record.address));

  // Primary Key is based on the fact that I'm only storing data for
  // Holliston MA, E.g. street name/number is unique enough for a single
  // a single town. (although maybe apt/condo will trip me up?)
  //
  // If I wanted to store other towns then town/state/zip would need
  // to be incorporated.
  //
  //Also assumes that a single address will not appear more than
  //once in the same monthly listing.

  const fullStreetName =
    record.address.streetName +
    ' ' +
    suffixUtil.expand(record.address.streetSuffix);

  //PK format: STREET#<full street name>
  const pk = ('STREET#' + fullStreetName).toUpperCase();

  //SK format: <street number>#<YYYYMM>
  const sk = (
    record.address.streetNumber +
    '#' +
    record.year +
    record.month
  ).toUpperCase();

  //GSIPK1 format: YEAR#<yyy>
  const gsipk1 = 'YEAR#' + record.year;

  //GSISK1 format: <full street name>#<street number>#<yyyymm>
  const gsisk1 = (
    fullStreetName +
    '#' +
    record.address.streetNumber +
    '#' +
    record.year +
    record.month
  ).toUpperCase();

  const addressAsString =
    record.address.streetNumber +
    ' ' +
    record.address.streetName +
    ' ' +
    record.address.streetSuffix +
    ' ' +
    (record.address.unit ? `${record.address.unit} ` : '') +
    record.address.townName +
    ' ' +
    record.address.stateName +
    ' ' +
    record.address.zipCode;

  const addressAsMap = {
    streetNumber: { N: record.address.streetNumber },
    streetName: { S: record.address.streetName },
    streetSuffix: { S: record.address.streetSuffix },
    unit: { S: record.address.unit },
    townName: { S: record.address.townName },
    stateName: { S: record.address.stateName },
    zipCode: { S: record.address.zipCode }
  };

  const importDate = new Date();

  const importTimestamp = Date.now() + '';

  const params = {
    TableName: DYNAMODB_TABLE,
    Item: {
      PK: {
        S: pk
      },
      SK: {
        S: sk
      },
      GSIPK1: {
        S: gsipk1
      },
      GSISK1: {
        S: gsisk1
      },
      SourceUrl: {
        S: record.sourceUrl
      },
      MonthName: {
        S: record.monthName
      },
      Month: {
        N: record.month
      },
      Year: {
        N: record.year
      },
      FullAddress: {
        S: addressAsString
      },
      Address: {
        M: addressAsMap
      },
      Buyer: {
        S: record.buyer
      },
      Seller: {
        S: record.seller
      },
      Price: {
        N: record.price
      },
      ImportDate: {
        S: importDate
      },
      ImportTimestamp: {
        N: importTimestamp
      }
    }
  };

  if (dryrun) {
    console.log('PutItemCommand params', JSON.stringify(params, null, 2));
  } else {
    verbose('PutItemCommand params', JSON.stringify(params));
    const command = new PutItemCommand(params);

    await dbClient.send(command);
  }
};

//------------- Utility routines ----------------------

//------------- Main ----------------------
const main = async (rootUrls) => {
  const s3Client = new S3Client({ apiVersion: '2006-03-01', region: REGION });
  const dbClient = new DynamoDBClient({
    region: REGION,
    logger: console,
    debug: false
  });

  //for these top level pages
  for (const root of rootUrls) {
    //get a list of child pages that contain the sales image
    for (const url of await getListings(root)) {
      //extract the image data
      let { imageUrl, imageName, month, year } = await getImageData(url);

      //download the image and upload to S3
      let { Key, Bucket } = await fetchAndUploadImage(
        s3Client,
        imageUrl,
        imageName
      );

      //get OCR text via AWS textract, referencing the image in S3
      let textractObject = await getTextFromImage(Bucket, Key);

      //pull out the LINE data from the textract output
      let rawText = getLineData(textractObject);

      //turn that raw line data into JSON records.
      let records = getRecords(rawText, month, year, imageUrl);

      //put those records into Dynamo
      for (let record of records) {
        await putItem(dbClient, record);
      }

      //don't hammer the webserver
      debug('sleep for 1 minute');
      await sleep(60000);
    }
  }
};

module.exports = {
  main,
  putItem,
  //for unit tests
  getLineData,
  getRecords
};
