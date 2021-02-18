'use strict';

const suffixUtil = require('street-suffix');

// const uuid = require('uuid').v4;
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');

const REGION = 'us-east-2';

const monthNumberLookup = {
  JANUARY: 1,
  FEBRUARY: 2,
  MARCH: 3,
  APRIL: 4,
  MAY: 5,
  JUNE: 6,
  JULY: 7,
  AUGUST: 8,
  SEPTEMBER: 9,
  OCTOBER: 10,
  NOVEMBER: 11,
  DECEMBER: 12
};

const getMonthNumber = (month) => {
  return monthNumberLookup[month.toUpperCase()] || month;
};

const getPriceAsNumber = (priceString) => {
  return priceString.replace(/[$, ]/g, '');
};

const getAddressAsString = (address) => {
  return (
    address.streetNumber +
    ' ' +
    address.streetName +
    ' ' +
    address.streetSuffix +
    ' ' +
    address.townName +
    ' ' +
    address.stateName +
    ' ' +
    address.zipCode
  );
};

const putitem = async (record) => {
  // Primary Key is based on the fact that I'm only storing data for
  // Holliston MA, E.g. street name/number is unique enough for a single
  // a single town. (although maybe apt/condo will trip me up?)
  //
  // If I wanted to store other towns then town/state/zip would need
  // to be incorporated.

  //Format: STREET#<street name>
  const pk = (
    'STREET#' +
    record.address.streetName +
    ' ' +
    suffixUtil.expand(record.address.streetSuffix)
  ).toUpperCase();

  //Format: <YYYYMM>#<price>#<street number>
  const sk = (
    record.year +
    getMonthNumber(record.month) +
    '#' +
    getPriceAsNumber(record.price) +
    '#' +
    record.address.streetNumber
  ).toUpperCase();

  const client = new DynamoDBClient({
    region: REGION,
    logger: console,
    debug: true
  });

  const params = {
    TableName: 'hres-20210218',
    Item: {
      PK: {
        S: pk
      },
      SK: {
        S: sk
      },
      SourceUrl: {
        S: record.sourceUrl
      },
      Month: {
        S: record.month
      },
      Year: {
        N: record.year
      },
      Address: {
        S: getAddressAsString(record.address)
      },
      Buyer: {
        S: record.buyer
      },
      Seller: {
        S: record.seller
      },
      Price: {
        N: getPriceAsNumber(record.price)
      }
    }
  };

  console.log('Item', params);
  const command = new PutItemCommand(params);

  try {
    await client.send(command);
  } catch (error) {
    console.error(error);
  }
};

(async () => {
  const fs = require('fs');
  const rawInput = fs.readFileSync('out.json');
  const items = JSON.parse(rawInput);
  for (const item of items) {
    console.log(item);
    await putitem(item);
  }
})();
