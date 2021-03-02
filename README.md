# Holliston Real Estate Sales

Web scraping real estate sales numbers for the town of Holliston MA. All recent data is stored as _images_ (**retch**) which makes the problem a little bit more interesting :)

Stack:

- Node, Axios and Cheerio for the scraping
- Images are stored in S3 and OCR is performed via [AWS Textract](https://aws.amazon.com/textract/)
- Final output stored in DyanmoDB

## To Do
- [ ] Consider public vs. open data and anonymizing names.  https://citizens-guide-open-data.github.io/guide/4-od-and-privacy
- [X] capture initial dump of 10 year archive! http://archive.hollistonreporter.com/search?search=Recent+Real+Estate+Sales
- [ ] Build basic UI with JQuery and Google Charts https://developers.google.com/chart
- [ ] Return metadata structure that describes the data object.

```
{
   count: n,
   items: [ { item1 }, ... ],
   metadata: [ { attribute1}, ... ]
}
```

- [ ] Add ksuid to all records, but not part of a PK.
- [ ] Make sure numbers are zero padded for lexigraphical sorting.
- [ ] Modify API to return Month name not number.
- [ ] Split ETL into process up into lambda functions:
  - Local node.js program: parse website and upload images to S3 bucket. Eventually run this program on scheduled EC2 instance.
  - Lambda function triggered on S3 bucket update: put image through AWS textract, output into DynamoDB table "hres_etl_textract" with PK=S3 URI of image.
  - Lambda function triggered on DynamoDB stream: convert textract into records and insert into DynamoDB table "hres_prod".
- [ ] Another trigger to get lat,long for address for use with integration to mapping services.
- [ ] Generate swagger doc and host on netlify using https://github.com/swagger-api/swagger-ui
- [ ] Refine data modeling using NoSQL workbench.
- [ ] Add another method to API for GSI1.
- [ ] Register a domain?
- [ ] Buy google ads?
