'use strict';

const debug = require('debug')('index');
const verbose = require('debug')('index:verbose');

const Stream = require('stream');
const Axios = require('axios');
const $ = require('cheerio');

const AWS = require('aws-sdk');

AWS.config.logger = console;

const INDEX_URL = 'https://hollistonreporter.com/category/real-estate/';
const REGION = 'us-east-2';

const getErrorMessage = (fn, url, error) => {
  let msg = `getPageList fetch of ${INDEX_URL} returned`;

  if (error.message) {
    msg += ` ${error.status} (${error.statusText})`;
  } else {
    msg += JSON.stringify(error);
  }

  return msg;
};

const getPageList = async () => {
  const pageUrls = [];

  let response = null;
  try {
    response = await Axios.get(INDEX_URL);
  } catch (error) {
    throw new Error(getErrorMessage(INDEX_URL, error));
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
  debug('getImageData', pageUrl);

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
    /Sales[\s\-\:\–]+([a-zA-Z]+)\s([0-9]{4})/
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

const fetchAndUploadImage = async (imageUrl, imageName) => {
  //fetch the image
  let imageResponse = null;
  try {
    debug('fetching image...');
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

  //upload the image
  AWS.config.getCredentials(function (err) {
    if (err) {
      debug('credentials not loaded', JSON.stringify(err));
    } else {
      debug('Access key', AWS.config.credentials.accessKeyId);
    }
  });

  const s3 = new AWS.S3({
    apiVersion: '2006-03-01',
    region: REGION
  });

  const params = {
    Bucket: 'holliston-real-estate-sales',
    Key: imageName,
    Body: pass
  };

  const s3Response = await s3.upload(params).promise();
  debug('s3 upload complete');
  verbose('s3 response', s3Response);

  return s3Response;
};

/******* Example using v3 api *********/
const uploadImageV3 = async (imageUrl) => {
  const imageResponse = await Axios.get(imageUrl, {
    responseType: 'stream'
  });

  let pass = new Stream.PassThrough();
  imageResponse.data.pipe(pass);

  //V3 of the S3 API does not support passthrough.  See https://github.com/aws/aws-sdk-js-v3/issues/1920
  //
  // const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  // const s3 = new S3Client({ region: REGION });
  // const params = {
  //   Bucket: 'holliston-real-estate-sales',
  //   Key: 'test.jpg',
  //   Body: pass
  // };
  // try {
  //   const r = await s3.send(new PutObjectCommand(params));
  //   debug(r);
  // } catch (error) {
  //   debug(error);
  // }

  //Here is the workaround:
  const { S3Client } = require('@aws-sdk/client-s3');
  const { Upload } = require('@aws-sdk/lib-storage');

  const upload = new Upload({
    client: new S3Client({ region: REGION }),
    params: {
      Bucket: 'holliston-real-estate-sales',
      Key: 'test.jpg',
      Body: pass,
      ContentType: 'image/jpeg'
    }
  });

  const result = await upload.done();
  debug('upload result', result);
};
/******* END *********/

const getTextFromImage = async (bucket, key) => {
  debug(`extract text from ${bucket}/${key}`);
  const {
    TextractClient,
    DetectDocumentTextCommand
  } = require('@aws-sdk/client-textract');
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

const processTextractObject = (textractObject) => {
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

const getRecords = (textItems, month, year) => {
  const records = [];

  let record = {
    month: month,
    year: year,
    address: '',
    price: '',
    seller: '',
    buyer: ''
  };

  let state = 0;

  for (let item of textItems) {
    item = item.trim();

    //0 = need address
    if (state === 0) {
      //start of section is always an address
      if (item.match(/^[0-9]/)) {
        record.address = item;
        state = 1;

        //if the address is long then AWS textrac does not split the price into a new item.
        let split = item.split('$');
        if (split.length > 1) {
          [record.address, record.price] = split;
          state = 2;
        }
      }

      //append town state zip :)
      record.address += ' Holliston, MA 01746';
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
      records.push(record);

      //reset
      record = {
        address: '',
        price: '',
        seller: '',
        buyer: ''
      };
      state = 0;
    } else {
      throw new Error('unsupported state: ' + state + '. Item = ' + item);
    }
  }

  debug('# of records', records.length);
  verbose('records', records);
  return records;
};

const sleep = async (timeout) => {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
};

const processPage = async (url) => {
  let { imageUrl, imageName, month, year } = await getImageData(url);
  let { Key, Bucket } = await fetchAndUploadImage(imageUrl, imageName);
  let textractObject = await getTextFromImage(Bucket, Key);
  let rawText = await processTextractObject(textractObject);
  let records = getRecords(rawText, month, year);
  verbose('records produced', records);
};

const processAll = async () => {
  for (const url of await getPageList()) {
    await sleep(5000);
    processPage(url);
  }
};

//export for testing
module.exports.processTextractObject = processTextractObject;
module.exports.getRecords = getRecords;

try {
  // getImageData(
  //   'https://hollistonreporter.com/2020/12/holliston-real-estate-sales-november-2020-part-1/'
  // );
  processPage(
    'https://hollistonreporter.com/2020/12/holliston-real-estate-sales-november-2020-part-1/'
  );
} catch (error) {
  console.log(error);
}
