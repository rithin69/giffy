const version = '1.3';
const giphyTrendingUrl = 'https://api.giphy.com/v1/gifs/trending?api_key=I2xQqf0KUkcHfKapQBCW9I5aR6HuCsdN&limit=12';

const appAssets = [
    'index.html',
    'main.js',
    'images/flame.png',
    'images/logo.png',
    'images/sync.png',
    'vendor/bootstrap.min.css',
    'vendor/jquery.min.js',
    'images/icons/icon-144x144.png'
];

const poisonedText = 'Your cache has been poisoned!';

// SW Install
self.addEventListener('install', e => {
    console.log('Installing service worker and caching assets...');
    
    e.waitUntil(
        Promise.all([
            caches.open(`static-${version}`).then(cache => {
                console.log('Caching app assets...');
                return cache.addAll(appAssets);
            }),
            preCacheGiphyTrending() // Pre-cache the Giphy API responses during installation
        ])
    );
});

// Function to prefetch and cache Giphy API responses
const preCacheGiphyTrending = () => {
    return fetch(giphyTrendingUrl)
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch Giphy trending data');
            return response.json();
        })
        .then(data => {
            const gifUrls = data.data.map(gif => gif.images.downsized_large.url);
            return caches.open(`stale-${version}`).then(cache => {
                return Promise.all(gifUrls.map(url => fetch(url).then(res => cache.put(url, res.clone()))));
            });
        })
        .catch(error => {
            console.error('Failed to pre-cache Giphy data:', error);
        });
};

function loadImagesFromCache(client) {
    caches.open('image-cache').then(cache => {
        cache.keys().then(keys => {
            keys.forEach(key => {
                cache.match(key).then(response => {
                    if (response && response.headers.get('Content-Type') === 'image/png') {
                        response.blob().then(blob => {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                                client.postMessage({ action: 'displayImage', imageData: reader.result });
                            };
                            reader.readAsDataURL(blob);  // Convert Blob to DataURL
                        });
                    }
                });
            });
        });
    });
}

// SW Activate
self.addEventListener('activate', e => {
    console.log('Activating new service worker...');
    let cleaned = caches.keys().then(keys => {
        return Promise.all(keys.map(key => {
            if (key !== `static-${version}` && key !== 'image-cache' && key !== `stale-${version}`) {
                console.log(`Deleting old cache: ${key}`);
                return caches.delete(key);
            }
        }));
    });
    e.waitUntil(cleaned);
});

// Static Cache Strategy - Cache First for Static Assets
const cacheFirst = (req, cacheName = `static-${version}`) => {
    return caches.match(req).then(cachedRes => {
        if (cachedRes) {
            console.log(`Serving ${req.url} from cache...`);
            return cachedRes;
        }

        return fetch(req).then(networkRes => {
            console.log(`Fetching ${req.url} from network...`);
            return caches.open(cacheName).then(cache => {
                cache.put(req, networkRes.clone());
                return networkRes;
            });
        }).catch(err => {
            console.error(`Fetch failed for ${req.url}:`, err);
        });
    });
};

const createPoisonedResponse = () => {
    return new Response(poisonedText, {
        headers: { 'Content-Type': 'text/plain' }
    });
};

// Create a poisoned response (text-based for non-images, placeholder image for images)
function isValidBase64(str) {
    try {
        return btoa(atob(str)) === str;  // Check if the string is a valid Base64 string
    } catch (e) {
        return false;
    }
}

// Poison the cache, but only affect the images stored in `image-cache`
const poisonImageCache = () => {
    return caches.open('image-cache').then(cache => {
        return cache.keys().then(keys => {
            const poisonPromises = keys.map(key => {
                console.log(`Poisoning image cache entry: ${key.url}`);
                return cache.put(key, createPoisonedResponse(key));
            });
            return Promise.all(poisonPromises).then(() => {
                console.warn(`Image cache poisoned`);
                return createPoisonedResponse(); // Return a response indicating the cache was poisoned
            });
        });
    });
};

function createBlobFromBase64(base64Data, contentType) {
    const binary = atob(base64Data);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
    }
    return new Blob([array], { type: contentType });
}

// Serve the poisoned content for images in `image-cache`
const servePoisonedContent = (req) => {
    return caches.match(req).then(cachedRes => {
        if (cachedRes) {
            console.log(`Serving poisoned content for: ${req.url}`);
            return createPoisonedResponse(req); // Use the appropriate response based on request type
        }
        return fetch(req);
    });
};

function saveImageToCache(encryptedImageData) {
    caches.open('image-cache').then(cache => {
        const blob = createBlobFromBase64(encryptedImageData, 'image/png');
        const url = `captured-image-${Date.now()}.png`;  // Store as an image file
        const response = new Response(blob, { headers: { 'Content-Type': 'image/png' } });
        cache.put(url, response).then(() => {
            console.log('Encrypted image saved to cache as blob.');
        });
    }).catch(err => {
        console.error('Failed to open image cache:', err);
    });
}

// SW Fetch Event
self.addEventListener('fetch', e => {
    const req = e.request;
    console.log(`Fetching: ${req.url}`); // Debugging

    // Poison the image cache if the "poison=true" parameter is in the URL
    if (req.url.includes('poison=true')) {
        console.log("Poisoning the image cache...");
        e.respondWith(poisonImageCache());  // Only poison images in the `image-cache`
    }
    // Serve poisoned content only for images in `image-cache`
    else if (req.url.match('images/')) {
        e.respondWith(
            caches.open('image-cache').then(cache => {
                return cache.match(req).then(cachedRes => {
                    if (cachedRes) {
                        return servePoisonedContent(req);
                    }
                    return fetch(req);
                });
            })
        );
    }
    // Giphy API requests - Stale-While-Revalidate with cleanup
    else if (req.url.includes('api.giphy.com/v1/gifs/trending')) {
        e.respondWith(staleWhileRevalidateAndClean(req));
    }
    // Static assets (JS, CSS, HTML) - Cache First
    else if (req.url.match(/\.(js|css|html|json)$/)) {
        e.respondWith(cacheFirst(req));
    }
    // Fallback for other requests
    else {
        e.respondWith(fetch(req).catch(err => {
            console.error(`Fetch failed for ${req.url}:`, err);
            return new Response('Network request failed', { status: 500 });
        }));
    }
});

self.addEventListener('message', function(event) {
    if (event.data.action === 'loadImages') {
        loadImagesFromCache(event.source);
    } else if (event.data.action === 'saveImage') {
        saveImageToCache(event.data.imageData);
    }
});

// Stale-While-Revalidate Strategy for GIFs with Cache Cleanup
const staleWhileRevalidateAndClean = (req, cacheName = `stale-${version}`) => {
    return caches.match(req).then(cachedRes => {
        const fetchPromise = fetch(req).then(networkRes => {
            if (!networkRes.ok) throw new Error(`Network response not OK for ${req.url}`);

            // Clone the network response as we need to use it in multiple places
            const responseClone = networkRes.clone();

            return responseClone.json().then(data => {
                const gifUrls = data.data.map(gif => gif.images.downsized_large.url);

                return caches.open(cacheName).then(cache => {
                    // Add new GIFs to cache
                    const cachePromises = gifUrls.map(url => {
                        return fetch(url).then(response => {
                            return cache.put(url, response.clone());
                        });
                    });

                    // Wait until all GIFs are cached
                    return Promise.all(cachePromises).then(() => {
                        // Remove old GIFs from the cache
                        cleanOldGifs(cache, gifUrls);

                        // Return the original network response
                        return networkRes;
                    });
                });
            });
        }).catch(error => {
            console.error("Network fetch failed:", error);
            return cachedRes;
        });

        // Return cached GIFs first, while network fetch happens in the background
        return cachedRes || fetchPromise;
    });
};

// Function to clean old GIFs from the cache
const cleanOldGifs = (cache, currentGifUrls) => {
    cache.keys().then(keys => {
        keys.forEach(key => {
            if (!currentGifUrls.includes(key.url)) {
                cache.delete(key);
            }
        });
    });
};

// Listen for Notifications
self.addEventListener('push', function(event) {
    let data = {};
    
    try {
        if (event.data) {
            // Check if the event data is JSON or plain text
            const dataText = event.data.text();
            data = JSON.parse(dataText);
        }
    } catch (error) {
        console.error('Failed to parse push data:', error);
    }

    const options = {
        body: data.body || 'Default body text',
        icon: data.icon || '/images/icons/icon-144x144.png',
        image: data.image || null,  // Include the image in the notification
        actions: data.actions || []  // Add any actions, like a cancel button
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'Default Title', options)
    );
});


// Handle notification actions (e.g., cancel)
self.addEventListener('notificationclick', function(event) {
    if (event.action === 'cancel') {
        event.notification.close();  // Close the notification
    } else {
        // Handle other actions, or default behavior
        clients.openWindow('/');
    }
});

// SW Sync Event
self.addEventListener('sync', function(event) {
    if (event.tag === 'image-sync') {
        event.waitUntil(syncImages());
    }
});

// Sync Images from IndexedDB to Cache Storage
function syncImages() {
    return indexedDB.open('imageDB').onsuccess = function(event) {
        let db = event.target.result;
        let tx = db.transaction('images', 'readonly');
        let store = tx.objectStore('images');
        store.getAll().onsuccess = function(event) {
            let images = event.target.result;
            return caches.open('image-cache').then(function(cache) {
                images.forEach(function(image) {
                    try {
                        // Attempt to decrypt the image data
                        let decryptedImage = CryptoJS.AES.decrypt(image.data, 'encryption-key').toString(CryptoJS.enc.Base64);

                        // Validate the decrypted output to ensure it's valid Base64
                        if (!isValidBase64(decryptedImage)) {
                            throw new Error("Invalid Base64 string");
                        }

                        // Convert the Base64 string to binary data
                        let binary = atob(decryptedImage);
                        let array = new Uint8Array(binary.length);
                        for (let i = 0; i < binary.length; i++) {
                            array[i] = binary.charCodeAt(i);
                        }

                        // Create a Blob from the binary data and store it in the cache
                        let blob = new Blob([array], { type: 'image/png' });
                        cache.put(`captured-image-${Date.now()}.png`, new Response(blob, { headers: { 'Content-Type': 'image/png' } }));
                    } catch (error) {
                        console.error("Failed to decrypt or convert the image:", error);

                        // Fallback to serving poisoned content if decryption fails
                        cache.put(`captured-image-${Date.now()}.txt`, createPoisonedResponse());
                    }
                });
                clearIndexedDB();
            });
        };
    };
}

// Clear IndexedDB
function clearIndexedDB() {
    let dbRequest = indexedDB.open('imageDB', 1);
    dbRequest.onsuccess = function(event) {
        let db = event.target.result;
        let tx = db.transaction('images', 'readwrite');
        let store = tx.objectStore('images');
        store.clear();
    };
}
