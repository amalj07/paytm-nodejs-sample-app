const express = require('express')
const path = require('path')
const https = require('https')
const qs = require('querystring')
const ejs = require('ejs')
require('dotenv').config()

const app = express()

// Middleware for body parsing
const parseRequest = express.urlencoded({ extended: false })

// Set the view engine to ejs
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')

const checksum_lib = require('./Paytm/checksum')

const port = process.env.PORT || 3000
const PROD_URL = "https://paytm-nodejs-sample-app.herokuapp.com"
const DEV_URL = 'http://localhost:' + port
const BASE_URL = (process.env.NODE_ENV ? PROD_URL : DEV_URL);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname + '/index.html'))
})

app.post('/paynow', [parseRequest], (req, res) => {
  try {
    if (!req.body.name || !req.body.amount || !req.body.email || !req.body.phone) {
      res.status(400).send('Payment failed')
    } else {
      var params = {};
      params['MID'] = process.env.MID;
      params['WEBSITE'] = process.env.WEBSITE;
      params['CHANNEL_ID'] = process.env.CHANNEL_ID;
      params['INDUSTRY_TYPE_ID'] = process.env.INDUSTRY_TYPE_ID;
      params['ORDER_ID'] = 'TEST_' + new Date().getTime();
      params['CUST_ID'] = req.body.name.replace(/\s+/g, '');
      params['TXN_AMOUNT'] = req.body.amount.toString();
      params['CALLBACK_URL'] = BASE_URL + '/response';
      params['EMAIL'] = req.body.email;
      params['MOBILE_NO'] = req.body.phone.toString();

      checksum_lib.genchecksum(params, process.env.KEY, function (err, checksum) {
        var txn_url = "https://securegw-stage.paytm.in/theia/processTransaction"; // for staging
        // var txn_url = "https://securegw.paytm.in/theia/processTransaction"; // for production

        var form_fields = "";
        for (var x in params) {
          form_fields += "<input type='hidden' name='" + x + "' value='" + params[x] + "' >";
        }
        form_fields += "<input type='hidden' name='CHECKSUMHASH' value='" + checksum + "' >";

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.write('<html><head><title>Merchant Checkout Page</title></head><body><center><h1>Please do not refresh this page...</h1></center><form method="post" action="' + txn_url + '" name="f1">' + form_fields + '</form><script type="text/javascript">document.f1.submit();</script></body></html>');
        res.end();
      });
    }
  } catch (error) {
    console.log(error)
    res.render('error')
  }
})

app.post('/response', (req, res) => {
  try {
    var body = '';

    req.on('data', function (data) {
      body += data;
    });

    req.on('end', function () {
      var html = "";
      var post_data = qs.parse(body);

      // received params in callback
      // console.log('Callback Response: ', post_data, "\n");


      // verify the checksum
      var checksumhash = post_data.CHECKSUMHASH;
      // delete post_data.CHECKSUMHASH;
      var result = checksum_lib.verifychecksum(post_data, process.env.KEY, checksumhash);
      // console.log("Checksum Result => ", result, "\n");


      // Send Server-to-Server request to verify Order Status
      var params = { "MID": process.env.MID, "ORDERID": post_data.ORDERID };

      checksum_lib.genchecksum(params, process.env.KEY, function (err, checksum) {

        params.CHECKSUMHASH = checksum;
        post_data = 'JsonData=' + JSON.stringify(params);

        var options = {
          hostname: 'securegw-stage.paytm.in', // for staging
          // hostname: 'securegw.paytm.in', // for production
          port: 443,
          path: '/merchant-status/getTxnStatus',
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': post_data.length
          }
        };


        // Set up the request
        var response = "";
        var post_req = https.request(options, function (post_res) {
          post_res.on('data', function (chunk) {
            response += chunk;
          });

          post_res.on('end', function () {
            // console.log('S2S Response: ', response, "\n");

            var _result = JSON.parse(response);
            res.render('response', {
              'data': _result
            })
          });
        });

        // post the data
        post_req.write(post_data);
        post_req.end();
      });
    });
  } catch (error) {
    console.log(error)
    res.render('error')
  }
})

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
})
