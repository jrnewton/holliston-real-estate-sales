# Holliston Real Estate Sales

Web scraping real estate sales numbers for the town of Holliston MA.  All recent data is stored as *images* (__retch__) which makes the problem a little bit more interesting :)

Stack:
- Node, Axios and Cheerio for the scraping
- Images are stored in S3 and OCR is performed via [AWS Textract](https://aws.amazon.com/textract/)
- Final output stored in DyanmoDB
