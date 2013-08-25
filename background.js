/*
 * Copyright 2013 Stefan George & Felix Leupold
 */
 
var server_address = 'http://blockprism.likescale.com' // 'http://localhost:8000';
var timedelta = 3600000; // every hour

chrome.extension.onMessage.addListener(
    function(request, sender, sendResponse) {
        if (request.action == 'get_public_key') {
            var public_key = JSON.parse(localStorage.getItem('public_key_' + request.friend_facebook_id));
            var now = new Date();
            if (public_key && public_key.hasOwnProperty('public_key')) {
                sendResponse(public_key);
            }
            else if(!public_key || request.force || now - new Date(public_key.timestamp) > timedelta) {
                var blockprism_url = server_address + '/public_key/facebook/';
                $.get(blockprism_url, {facebook_id: request.friend_facebook_id} )
                    .done( function(response) {
                            public_key = {'public_key': response, 'enabled': true};
                            localStorage.setItem('public_key_' + request.friend_facebook_id, JSON.stringify(public_key));
                            sendResponse(public_key);
                        })
                    .fail( function(xhr, textStatus, errorThrown) {
                            localStorage.setItem('public_key_' + request.friend_facebook_id, JSON.stringify({'timestamp': now}));
                            sendResponse({error: 'profile not found'});
                        });
            }
            else {
                sendResponse({error: 'profile not found'});
            }
        }
        else if (request.action == 'set_encryption_status') {
            var public_key = JSON.parse(localStorage.getItem('public_key_' + request.friend_facebook_id));
            public_key.enabled = request.status;
            localStorage.setItem('public_key_' + request.friend_facebook_id, JSON.stringify(public_key));
            sendResponse(null);
        }
        else if (request.action == 'get_my_key_pair') {
            if (localStorage.getItem('my_facebook_id') == request.my_facebook_id && localStorage.getItem('my_rsa_key')) {
                sendResponse(JSON.parse(localStorage.getItem('my_rsa_key')));
            }
            else {
                sendResponse({error: 'rsa key not found'});
            }
        }
    return true;
    }
);

if (!localStorage.getItem('install_done')) {
    localStorage.setItem('install_done', true);
    chrome.tabs.create({url: 'http://blockprism.org/install.html'});
    chrome.tabs.query({url: "*://*.facebook.com/*"}, function(tabs) {
        $.each(tabs, function(index, tab) {
            chrome.tabs.reload(tab.id);
        });
    });
}