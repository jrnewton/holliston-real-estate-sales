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

const REGION = 'us-east-2';
const S3_BUCKET = 'holliston-real-estate-sales';
const DYNAMODB_TABLE = 'hres-20210218';

const getErrorMessage = (fn, url, error) => {
  let msg = `getPageList fetch of ${url} returned`;

  if (error.message) {
    msg += ` ${error.status} (${error.statusText})`;
  } else {
    msg += JSON.stringify(error);
  }

  return msg;
};

const getListings = async (rootUrl) => {
  const pageUrls = [];

  let response = null;
  try {
    response = await Axios.get(rootUrl);
  } catch (error) {
    throw new Error(getErrorMessage(rootUrl, error));
  }

  const html = response.data;
  const links = $('h3 a', html);

  for (const element of links) {
    if (element.attribs.title.startsWith('Holliston Real Estate Sales')) {
      const pageUrl = element.attribs.href;
      debug('getPageList found', pageUrl);
      pageUrls.push(pageUrl);
    }
  }

  return pageUrls;
};

const getImageData = async (pageUrl) => {
  debug('[getImageData]', pageUrl);

  let getResponse = null;
  try {
    getResponse = await Axios.get(pageUrl);
  } catch (error) {
    throw new Error(getErrorMessage(pageUrl, error));
  }

  const html = getResponse.data;
  verbose('html head', html.slice(0, 100));

  const headingTag = $('.fl-heading-text', html);
  //tag text looks like:
  //Holliston Real Estate Sales – November 2020; Part 1
  //Holliston Real Estate Sales: January 2021 – Part 1
  const headingText = headingTag.text();

  //Note: text sometimes uses a weird hypen '–'
  const headingMatch = headingText.match(
    /Sales[\s\-:–]+([a-zA-Z]+)\s([0-9]{4})/
  );

  debug('heading text', headingText, 'match', headingMatch);

  if (!headingMatch) {
    throw new Error(`could not find month/year from ${pageUrl}`);
  }

  const month = headingMatch[1];
  const year = headingMatch[2];

  const figures = $('figure img', html);
  verbose('img tag', figures[1]);
  const imageUrl = figures[1].attribs.src;

  const data = {
    month: month,
    year: year,
    imageUrl: imageUrl,
    imageName: null
  };

  //the image name is everything after /uploads/ in imageUrl
  const urlMatch = imageUrl.match(/\/uploads\/(.+)/);

  debug('image url', imageUrl, 'match', urlMatch);

  if (!urlMatch) {
    throw new Error(`could not match image name from ${imageUrl}`);
  }

  data.imageName = urlMatch[1].replace(/\//g, '_');
  debug('image data', data);

  return data;
};

const fetchAndUploadImage = async (s3Client, imageUrl, imageName) => {
  debug('[fetchingAndUploadImage]', imageName);

  //check to see if image is already in S3.
  const headCommand = new HeadObjectCommand({
    Bucket: S3_BUCKET,
    Key: imageName
  });

  try {
    const headResponse = await s3Client.send(headCommand);
    verbose('s3 head response', headResponse);
    if (headResponse.$metadata.httpStatusCode === 200) {
      //its already there - bail now
      verbose('object already in S3, exit early');
      return { Key: imageName, Bucket: S3_BUCKET };
    }
  } catch (error) {
    //object aint there
  }

  let imageResponse = null;
  try {
    imageResponse = await Axios.get(imageUrl, {
      responseType: 'stream'
    });
    debug('done');
  } catch (error) {
    throw new Error(getErrorMessage(imageUrl, error));
  }

  //setup the passthrough from download pipe to S3 upload pipe.
  let pass = new Stream.PassThrough();
  imageResponse.data.pipe(pass);

  //V3 does not support body passthrough, so use Upload as workaround.
  //See https://github.com/aws/aws-sdk-js-v3/issues/1920
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: S3_BUCKET,
      Key: imageName,
      Body: pass
    }
  });

  const s3Response = await upload.done();
  debug('s3 upload complete');
  verbose('s3 response', s3Response);

  return s3Response;
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

const CreateRecord = () => {
  return {
    sourceUrl: '',
    month: '',
    year: '',
    address: {
      streetNumber: '',
      streetName: '',
      streetSuffix: '',
      townName: '',
      stateName: '',
      zipCode: ''
    },
    price: '',
    seller: '',
    buyer: ''
  };
};

const getRecords = (textItems, month, year, imageUrl) => {
  debug('[getRecords]', month, year, imageUrl);

  const records = [];

  let record = CreateRecord();

  let state = 0;

  for (let item of textItems) {
    item = item.trim();

    //0 = need address
    if (state === 0) {
      //Start of line is always an address.
      //if the address is long then AWS textrac seems to not
      //split the price into a new line.
      const addressMatch = item.match(
        /^([0-9]+) ([a-zA-Z ]+) ([a-zA-Z]+)[ ]?[$]?([0-9,]+)?/
      );

      if (addressMatch) {
        debug('address match', addressMatch);

        record.address.streetNumber = addressMatch[1];
        record.address.streetName = addressMatch[2];
        record.address.streetSuffix = addressMatch[3];

        //optional price
        if (addressMatch.length > 4 && addressMatch[4]) {
          record.price = addressMatch[4];
          state = 2;
        } else {
          state = 1;
        }
      }

      //bash in town state zip :)
      record.address.townName = 'Holliston';
      record.address.stateName = 'MA';
      record.address.zipCode = '01746';
    }
    //1 = need price
    else if (state === 1) {
      record.price = item;
      state = 2;
    }
    //2 = need seller label
    else if (state === 2) {
      if (item.toUpperCase() === 'SELLER') {
        state = 3;
      }
    }
    //3 = need seller
    else if (state === 3) {
      record.seller = item;
      state = 4;
    }
    //4 = need buyer label
    else if (state === 4) {
      if (item.toUpperCase() === 'BUYER') {
        state = 5;
      }
    }
    //5 = need buyer
    else if (state === 5) {
      record.buyer = item;

      record.month = month;
      record.year = year;
      record.sourceUrl = imageUrl;

      records.push(record);

      //reset
      record = CreateRecord();
      state = 0;
    } else {
      throw new Error('unsupported state: ' + state + '. Item = ' + item);
    }
  }

  debug('# of records', records.length);
  verbose('records', records);

  return records;
};

const putItem = async (dbClient, record) => {
  debug('[putItem]', record.year, record.month, JSON.stringify(record.address));

  // Primary Key is based on the fact that I'm only storing data for
  // Holliston MA, E.g. street name/number is unique enough for a single
  // a single town. (although maybe apt/condo will trip me up?)
  //
  // If I wanted to store other towns then town/state/zip would need
  // to be incorporated.

  //Format: STREET#<street name>
  const pk = (
    'STREET#' +
    record.address.streetName +
    ' ' +
    suffixUtil.expand(record.address.streetSuffix)
  ).toUpperCase();

  //Format: <YYYYMM>#<price>#<street number>
  const sk = (
    record.year +
    getMonthNumber(record.month) +
    '#' +
    getPriceAsNumber(record.price) +
    '#' +
    record.address.streetNumber
  ).toUpperCase();

  const params = {
    TableName: DYNAMODB_TABLE,
    Item: {
      PK: {
        S: pk
      },
      SK: {
        S: sk
      },
      SourceUrl: {
        S: record.sourceUrl
      },
      Month: {
        S: record.month
      },
      Year: {
        N: record.year
      },
      Address: {
        S: getAddressAsString(record.address)
      },
      Buyer: {
        S: record.buyer
      },
      Seller: {
        S: record.seller
      },
      Price: {
        N: getPriceAsNumber(record.price)
      }
    }
  };

  verbose('PutItemCommand params', JSON.stringify(params));
  const command = new PutItemCommand(params);

  await dbClient.send(command);
};

//------------- Utility routines ----------------------
const sleep = async (timeout) => {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
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

const getMonthNumber = (month) => {
  return monthNumberLookup[month.toUpperCase()] || month;
};

const getPriceAsNumber = (priceString) => {
  return priceString.replace(/[$, ]/g, '');
};

const getAddressAsString = (address) => {
  return (
    address.streetNumber +
    ' ' +
    address.streetName +
    ' ' +
    address.streetSuffix +
    ' ' +
    address.townName +
    ' ' +
    address.stateName +
    ' ' +
    address.zipCode
  );
};

//------------- Main ----------------------
const rootUrls = [
  'https://hollistonreporter.com/category/real-estate/',
  'https://hollistonreporter.com/category/real-estate/page/2/',
  'https://hollistonreporter.com/category/real-estate/page/3/'
];

(async () => {
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
})();

//export for testing
module.exports.getLineData = getLineData;
module.exports.getRecords = getRecords;
