'use strict';

const axios = require('axios');
const $ = require('cheerio');

const getImage = async (pageUrl) => {
  const response = await axios.get(pageUrl);
  const html = response.data;
  // console.log(html.slice(0, 100));
  const figures = $('figure img', html);
  console.log(figures[1].attribs.src);
};

const getIndex = async () => {
  const response = await axios.get(
    'https://hollistonreporter.com/category/real-estate/'
  );
  const html = response.data;
  const links = $('h3 a', html);
  for (const element of links) {
    if (element.attribs.title.startsWith('Holliston Real Estate Sales')) {
      console.log(element.attribs.href);
    }
  }
};

(async () => {
  await getIndex();
  await getImage(
    'https://hollistonreporter.com/2021/02/holliston-real-estate-sales-january-2021-part-1/'
  );
})();
