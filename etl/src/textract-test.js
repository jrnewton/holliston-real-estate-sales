'use strict';

const { getLineData, getRecords, putItem } = require('./lib');
const textractObject = require('../../textract-out.json');

const lineData = getLineData(textractObject);
const records = getRecords(
  lineData,
  'November',
  '2020',
  'https://hollistonreporter.com/wp-content/uploads/2021/01/image-132.png'
);

//console.log(records);

for (let r of records) {
  putItem(null, r, true);
}
