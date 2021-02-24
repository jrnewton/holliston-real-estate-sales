'use strict';

const textractObject = require('./textract.json');
const { getLineData, getRecords } = require('../src/etl/lib');
const assert = require('assert');

it('should process textract object into string array', () => {
  const results = getLineData(textractObject);
  assert.strictEqual(results.length, 41);
});

it('should produce records from raw textract array', () => {
  //prettier-ignore
  const textractOutput = ["90 Rolling Meadow Dr $735,000","Seller","Appleton Grove LLC","Buyer","John and Margaret Gabour","192 Adams St","$607,500","Seller","Stephanie C and James M Pace","Buyer","Anna Zanelli and Gabriele Brambilla","24 Spring St","$799,900","Seller","O'Leary Builders Inc","Buyer","Brendan M Jackson and Sarah E and John D Shannanhan","370 Norfolk St","$670,000","Seller","Ricardo R and Alison H Morant","Buyer","Ryan T and Aishwarya J Weaver","47 Avon St","$535,000","Seller","Linda Perrotti and Linda P Skarmeas","Buyer","Alex R Wurzel and Marisa Altieri","55 Dean Rd","$440,500","Seller","Johanna S Thomas","Buyer","Patricia M Thomas","657 Concord St","$540,000","Seller","Devin and Jennifer Potter","Buyer","Jennifer Hamilton and Colin Edward and Vanessa Maryann Connors"];
  const records = getRecords(
    textractOutput,
    'January',
    2021,
    'https://hollistonreporter.com/wp-content/uploads/2021/01/image-132.png'
  );
  assert.strictEqual(records.length, 7);
});
