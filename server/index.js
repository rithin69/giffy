// Modules
const http = require('http');
const push = require('./push');

// Create HTTP Server
http.createServer((request, response) => {

  // Enable CORS
  response.setHeader('Access-Control-Allow-Origin', '*');

  // Get request vars
  const { url, method } = request;

  // Subscribe
  if (method === 'POST' && url.match(/^\/subscribe\/?/)) {

    // Get POST Body
    let body = [];

    // Read body stream
    request.on('data', chunk => body.push(chunk)).on('end', () => {

      // Parse subscription body to object
      let subscription = JSON.parse(body.toString());

      // Log the subscription data
      console.log('New Subscription:', subscription);

      // Store subscription for push notifications
      push.addSubscription(subscription);

      // Respond
      response.end('Subscribed');
    });

  // Public Key
  } else if (url.match(/^\/key\/?/)) {

    // Fetch the public VAPID key
    const vapidKey = push.getKey();

    // Log the public VAPID key
    console.log('VAPID Public Key:', vapidKey);

    // Respond with public key from push module
    response.end(vapidKey);

  // Push Notification
  } else if (method === 'POST' && url.match(/^\/push\/?/)) {

    // Get POST Body
    let body = [];

    // Read body stream
    request.on('data', chunk => body.push(chunk)).on('end', () => {

      // Send notification with POST body
      push.send(body.toString());

      // Respond
      response.end('Push Sent');
    });
  
  // Not Found
  } else {
    response.statusCode = 404;
    response.end('Error: Unknown Request');
  }

}).listen(3333, () => { console.log('Server Running') });
