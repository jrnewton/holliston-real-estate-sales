'use strict';

//This function is responsible for capturing new
//source images from hollistonreporter.com
//and uploading to S3

const { sleep } = require('shlof');
const fs = require('fs');
const Axios = require('axios');
const $ = require('cheerio');

const indent = (level) => {
  return ' '.repeat(level);
};

const getImageData = async (pageUrl, level = 0) => {
  console.log(indent(level), 'getImage on', pageUrl);
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

const process = async (imageData, level = 0) => {
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
      indent(level),
      `aws s3 cp ${imagePath} s3://hres/20210301/ --metadata "page-url=${pageUrl},image-url=${imageUrl}"`
    );
  } catch (error) {
    console.log(indent(level), 'error', imageUrl, error);
  }
};

const handler = async (_event, _context) => {
  const rootUrls = ['https://hollistonreporter.com/category/real-estate/'];
  let level = 0;

  for (const rootUrl of rootUrls) {
    console.log(indent(level), 'root', rootUrl);

    let response = null;
    try {
      response = await Axios.get(rootUrl);
    } catch (error) {
      console.log(indent(level), error);
    }

    const html = response.data;
    const links = $('h3 a', html);

    for (const element of links) {
      level += 2;
      if (element.attribs.title.toUpperCase().includes('REAL ESTATE SALES')) {
        const pageUrl = element.attribs.href;
        console.log(indent(level), 'save', element.attribs.title);

        level += 2;
        try {
          const imageData = await getImageData(pageUrl, level);
          await process(imageData, level + 2);
        } catch (error) {
          console.log(indent(level), 'error!', error);
        } finally {
          level -= 2;
        }
      } else {
        console.log(indent(level), 'reject', element.attribs.title);
      }
      level -= 2;
    }

    if (rootUrls.length > 1) {
      sleep(5000);
    }
  }
};

exports.handler = handler;

if (process.env.RUN_MAIN) {
  handler(null, null);
}
