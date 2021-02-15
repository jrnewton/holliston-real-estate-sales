'use strict';

const Stream = require('stream');
const Axios = require('axios');
const $ = require('cheerio');

const AWS = require('aws-sdk');

AWS.config.logger = console;

const INDEX_URL = 'https://hollistonreporter.com/category/real-estate/';
const REGION = 'us-east-2';

const getPageList = async () => {
  const pageUrls = [];

  let response = null;
  try {
    response = await Axios.get(INDEX_URL);
  } catch (error) {
    console.warn(
      'getPageList failed',
      INDEX_URL,
      error.status,
      error.statusText
    );
  }

  if (response) {
    const html = response.data;
    const links = $('h3 a', html);

    for (const element of links) {
      if (element.attribs.title.startsWith('Holliston Real Estate Sales')) {
        const pageUrl = element.attribs.href;
        console.log('getPageList found', pageUrl);
        pageUrls.push(pageUrl);
      }
    }
  }

  return pageUrls;
};

const getImageData = async (pageUrl) => {
  console.log('getImageData', pageUrl);

  let getResponse = null;
  try {
    getResponse = await Axios.get(pageUrl);
  } catch (error) {
    console.warn('page fetch failed', pageUrl, error.status, error.statusText);
  }

  if (!getResponse) {
    console.warn('page response null');
    return null;
  }

  const html = getResponse.data;
  //console.log('html head', html.slice(0, 100));

  const figures = $('figure img', html);
  //console.log('img tag', figures[1]);
  const imageUrl = figures[1].attribs.src;

  const data = {
    imageUrl: imageUrl,
    imageName: null
  };

  //the image name is everything after /uploads/ in imageUrl
  const match = imageUrl.match(/\/uploads\/(.+)/);

  if (!match) {
    console.warn('could not match image name from', imageUrl);
    return null;
  }

  data.imageName = match[1].replace(/\//g, '_');
  console.log('image data', data);
  return data;
};

const uploadImage = async (imageUrl, imageName) => {
  //fetch the image
  let imageResponse = null;
  try {
    console.log('fetching image...');
    imageResponse = await Axios.get(imageUrl, {
      responseType: 'stream'
    });
    console.log('done');
  } catch (error) {
    console.warn(
      'image fetch failed',
      imageUrl,
      error.status
        ? `${error.status} ${error.statusText}`
        : JSON.stringify(error)
    );
  }

  if (!imageResponse) {
    console.warn('image response null');
    return null;
  }

  //setup the passthrough from download pipe to S3 upload pipe.
  let pass = new Stream.PassThrough();
  imageResponse.data.pipe(pass);

  //upload the image
  AWS.config.getCredentials(function (err) {
    if (err) {
      console.log('credentials not loaded', JSON.stringify(err));
    } else {
      console.log('Access key', AWS.config.credentials.accessKeyId);
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
  console.log('s3 response', s3Response);

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
  //   console.log(r);
  // } catch (error) {
  //   console.log(error);
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
  console.log('upload result', result);
};
/******* END *********/

const getTextFromImage = async (imageName) => {
  console.log('extract text from', imageName);
  const {
    TextractClient,
    DetectDocumentTextCommand
  } = require('@aws-sdk/client-textract');
  const client = new TextractClient({ region: REGION });
  const params = {
    Document: {
      S3Object: {
        Bucket: 'holliston-real-estate-sales',
        Name: imageName
      }
    }
  };
  const textractObject = await client.send(
    new DetectDocumentTextCommand(params)
  );

  console.log('textract output', textractObject);
  return textractObject;
};

const processTextractObject = (textractObject) => {
  console.log(typeof textractObject);

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

  console.log('text array', JSON.stringify(results));
  return results;
};

const getRecords = (results) => {
  //Use dummy output for testing
  //prettier-ignore
  results = ["90 Rolling Meadow Dr $735,000","Seller","Appleton Grove LLC","Buyer","John and Margaret Gabour","192 Adams St","$607,500","Seller","Stephanie C and James M Pace","Buyer","Anna Zanelli and Gabriele Brambilla","24 Spring St","$799,900","Seller","O'Leary Builders Inc","Buyer","Brendan M Jackson and Sarah E and John D Shannanhan","370 Norfolk St","$670,000","Seller","Ricardo R and Alison H Morant","Buyer","Ryan T and Aishwarya J Weaver","47 Avon St","$535,000","Seller","Linda Perrotti and Linda P Skarmeas","Buyer","Alex R Wurzel and Marisa Altieri","55 Dean Rd","$440,500","Seller","Johanna S Thomas","Buyer","Patricia M Thomas","657 Concord St","$540,000","Seller","Devin and Jennifer Potter","Buyer","Jennifer Hamilton and Colin Edward and Vanessa Maryann Connors"];

  const records = [];

  let record = {
    address: '',
    price: '',
    seller: '',
    buyer: ''
  };

  let state = 0;

  for (let item of results) {
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

  console.log('records', records);
  return records;
};

const sleep = async (timeout) => {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
};

const main = async () => {
  for (const url of await getPageList()) {
    await sleep(5000);
    let { imageUrl, imageName } = await getImageData(url);
    let { bucketName, objectName } = await uploadImage(imageUrl, imageName);
    let textractObject = getTextFromImage(bucketName, objectName);
    let results = parseText(textractObject);
    console.log(results);
  }
};

// main();

(async () => {
  // uploadImageV3(
  //   'https://hollistonreporter.com/wp-content/uploads/2021/02/January-Sales.jpg'
  // );

  // let { imageUrl, imageName } = await getImageData(
  //   'https://hollistonreporter.com/2021/02/holliston-real-estate-sales-january-2021-part-1/'
  // );
  // await uploadImage(imageUrl, imageName);

  // const textractObject = await getTextFromImage('2021_02_January-Sales.jpg');
  // processTextractObject(textractObject);
  getRecords();
})();
