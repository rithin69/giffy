// Modules
const http = require('http');
const push = require('./push');

// Create HTTP Server
http.createServer((request, response) => {

  // Enable CORS for cross-origin requests
  response.setHeader('Access-Control-Allow-Origin', '*');

  // Get the URL and HTTP method of the request
  const { url, method } = request;

  // Handle subscription requests
  if (method === 'POST' && url.match(/^\/subscribe\/?/)) {

    // Get the POST Body data
    let body = [];

    // Read the body data stream
    request.on('data', chunk => body.push(chunk)).on('end', () => {

      // Parse the subscription body to an object
      let subscription = JSON.parse(body.toString());

      // Log the subscription data
      console.log('New Subscription:', subscription);

      // Store the subscription for push notifications
      push.addSubscription(subscription);

      // Respond with a success message
      response.end('Subscribed');
    });

  // Handle requests to retrieve the VAPID public key
  } else if (url.match(/^\/key\/?/)) {

    // Fetch the public VAPID key
    const vapidKey = push.getKey();

    // Log the public VAPID key
    console.log('VAPID Public Key:', vapidKey);

    // Respond with the public key
    response.end(vapidKey);

  // Handle requests to send a push notification
  } else if (method === 'POST' && url.match(/^\/push\/?/)) {

    // Get the POST Body data
    let body = [];

    // Read the body data stream
    request.on('data', chunk => body.push(chunk)).on('end', () => {

      // Send the push notification with the body data
      push.send(body.toString());

      // Respond with a success message
      response.end('Push Sent');
    });

  // Handle unknown requests (404 Not Found)
  } else {
    response.statusCode = 404;
    response.end('Error: Unknown Request');
  }

}).listen(3333, () => { 
  console.log('Server Running');
});
