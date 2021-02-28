'use strict';

//Parse website to find images and put into S3 bucket.
//For now though the bucket is just a local directory.

const debug = require('debug')('etl:debug');
const verbose = require('debug')('etl:verbose');

const { getErrorMessage } = require('./lib');

const Axios = require('axios');
const $ = require('cheerio');
const urlToS3 = require('url-to-s3').default;

const sleep = async (timeout) => {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
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

const getListingImage = async (pageUrl) => {
  debug('getListingImage for', pageUrl);

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

const main = async (rootUrls) => {
  //for these top level pages
  for (const root of rootUrls) {
    //get a list of child pages that contain the sales image
    for (const url of await getListings(root)) {
      //get the image
      let { imageUrl, imageName, month, year } = await getImageData(url);

      urlToS3(REGION, imageUrl, S3_BUCKET);

      //download the image and upload to S3
      let { Key, Bucket } = await fetchAndUploadImage(
        s3Client,
        imageUrl,
        imageName
      );

      await sleep(60000);
    }
  }
};

const rootUrls = ['https://hollistonreporter.com/category/real-estate/'];

main(rootUrls);
