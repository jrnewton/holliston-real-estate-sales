'use strict';

/*
  One-off script to archive in s3 the 10 year archive.
*/

const fs = require('fs');
const FormData = require('form-data');
const Axios = require('axios');
const $ = require('cheerio');

const sleep = async (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

(async () => {
  for (let i = 1; i <= 21; i++) {
    console.log('page', i);
    const formData = new FormData();
    formData.append('page', i + '');
    try {
      const response = await Axios.post(
        'http://archive.hollistonreporter.com/search?search=Recent+Real+Estate+Sales',
        formData,
        {
          headers: formData.getHeaders()
        }
      );

      const html = response.data;
      const links = $('p.continue a', html);
      for (const link of links) {
        const href = link.attribs.href;
        console.log(href);

        try {
          const listingPageResponse = await Axios.get(
            'http://archive.hollistonreporter.com' + href,
            {
              responseType: 'stream'
            }
          );

          const downloadPath = '../archive/' + href.replace(/\//g, '_');
          listingPageResponse.data.pipe(fs.createWriteStream(downloadPath));
          console.log('  saved', downloadPath);
          console.log(
            '    ',
            `aws s3 cp ${downloadPath} s3://hres-archives/20210301/`
          );
        } catch (error) {
          console.log('  error', error);
        }

        sleep(1000);
      }
    } catch (error) {
      console.log(error);
    }

    sleep(5000);
  }
})();
