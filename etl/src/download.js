'use strict';

const fs = require('fs');
const Axios = require('axios');
const $ = require('cheerio');

const getImageData = async (pageUrl, logPrefix = '') => {
  console.log(logPrefix, 'getImage on', pageUrl);
  let getResponse = null;
  try {
    getResponse = await Axios.get(pageUrl);
  } catch (error) {
    throw new Error(pageUrl, error);
  }

  const html = getResponse.data;
  const figures = $('figure img', html);
  const imageUrl = figures[1].attribs.src;

  //the image name is everything after /uploads/ in imageUrl
  const urlMatch = imageUrl.match(/\/uploads\/(.+)/);
  let imageName = '';
  if (urlMatch) {
    imageName = urlMatch[1].replace(/\//g, '_');
  } else {
    imageName = imageUrl;
  }

  const data = {
    pageUrl: pageUrl,
    imageUrl: imageUrl,
    imageName: imageName
  };

  return data;
};

const process = async (imageData, logPrefix = '') => {
  const pageUrl = imageData.pageUrl;
  const imageUrl = imageData.imageUrl;
  const imageName = imageData.imageName;

  try {
    const imageResponse = await Axios.get(imageUrl, {
      responseType: 'stream'
    });

    const imagePath = '../archive/' + imageName;
    imageResponse.data.pipe(fs.createWriteStream(imagePath));
    console.log(
      logPrefix,
      `aws s3 cp ${imagePath} s3://hres/20210301/ --metadata "page-url=${pageUrl},image-url=${imageUrl}"`
    );
  } catch (error) {
    console.log('error', imageUrl, error);
  }
};

const rootUrls = [
  'https://hollistonreporter.com/category/real-estate/page/1/',
  'https://hollistonreporter.com/category/real-estate/page/2/',
  'https://hollistonreporter.com/category/real-estate/page/3/',
  'https://hollistonreporter.com/category/real-estate/page/4/',
  'https://hollistonreporter.com/category/real-estate/page/5/'
  //has text - must handle separate 'https://hollistonreporter.com/category/real-estate/page/6/'
];

const sleep = async (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

(async () => {
  for (const rootUrl of rootUrls) {
    console.log('root', rootUrl);

    let response = null;
    try {
      response = await Axios.get(rootUrl);
    } catch (error) {
      console.log(error);
    }

    const html = response.data;
    const links = $('h3 a', html);

    for (const element of links) {
      if (element.attribs.title.toUpperCase().includes('REAL ESTATE SALES')) {
        const pageUrl = element.attribs.href;
        console.log('  ', 'save', element.attribs.title);
        try {
          const imageData = await getImageData(pageUrl, '    ');
          await process(imageData, '      ');
        } catch (error) {
          console.log('    ', 'error!', error);
        }
      } else {
        console.log('  ', 'reject', element.attribs.title);
      }
    }

    sleep(5000);
  }
})();
