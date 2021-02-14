'use strict';

const Stream = require('stream');
const Axios = require('axios');
const $ = require('cheerio');

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
  // const s3 = new S3Client({ region: 'us-east-2' });
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
    client: new S3Client({ region: 'us-east-2' }),
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

const AWS = require('aws-sdk');

AWS.config.logger = console;

const INDEX_URL = 'https://hollistonreporter.com/category/real-estate/';

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
    region: 'us-east-2'
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

const getTextFromImage = (imageName) => {
  console.log('extract text from', imageName);
  return null;
};

const parseText = (textractObject) => {
  const results = [];
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
  return results;
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
  uploadImageV3(
    'https://hollistonreporter.com/wp-content/uploads/2021/02/January-Sales.jpg'
  );

  // let { imageUrl, imageName } = await getImageData(
  //   'https://hollistonreporter.com/2021/02/holliston-real-estate-sales-january-2021-part-1/'
  // );
  // await uploadImage(imageUrl, imageName);
})();
