/*
 * Copyright 2013 Stefan George & Felix Leupold
 */
 
var bg_page = chrome.extension.getBackgroundPage();

function login_success() {
    $('#facebook_id a').text(localStorage.getItem('my_facebook_id'));
    var facebook_link = 'http://www.facebook.com/' + localStorage.getItem('my_facebook_id');
    $('#facebook_id a').attr('href', facebook_link);
    if (localStorage.getItem('my_public_key')) {
        // $('#public_key').text(localStorage.getItem('my_public_key'));
        // $('#public_key_info').show();
        $('#passphrase_2').hide();
    }
    else {
        // $('#public_key_info').hide();
        $('#passphrase_2').show();
    }
    if (localStorage.getItem('my_rsa_key')) {
        $('#key_generation_info').hide();
    }
    else {
        $('#key_generation_info').show();
    }
    $('#logged_in').show();
    $('#logged_out').hide();
}

function logout_success() {
    $('#facebook_id a').text('');
    $('#facebook_id a').attr('href', '');
    // $('#public_key').text('');
    // $('#public_key_info').hide();
    $('#key_generation_info').hide();
    $('#logged_out').show();
    $('#logged_in').hide();
}

function disable_elements(elements) {
    $.each(elements, function(index, el) {
        $(el).attr('diabled', 'disabled');
    });
}

function enable_elements(elements) {
    $.each(elements, function(index, el) {
        $(el).removeAttr('diabled');
    });
}

function set_info(text) {
    $('#info').text(text).show();
    $('#error').hide();
}

function set_error(text) {
    $('#error').text(text).show();
    $('#info').hide();
}

function generate_key_pair(phrase, callback) {
    var bits = 2048;
    setTimeout(function() {
        var rsa_key = cryptico.generateRSAKey(phrase, bits);
        callback(rsa_key);
    }, 0);
}

var facebook = new OAuth2('facebook', {
                        client_id: '218116941675093',
                        client_secret: 'b6369c58b3609f2d00a54d8b7bfa8bf1',
                        api_scope: ''
                    });

function login() {
    facebook.authorize( function() {
        localStorage.setItem('my_access_token', facebook.getAccessToken());
        var facebook_url = 'https://graph.facebook.com/me';
        // get facebook profile
        $.get(facebook_url, {oauth_token: localStorage.getItem('my_access_token')})
            .done( function(response) {
                localStorage.setItem('my_facebook_id', response.username);
                set_info('Login successful! Please enter your passphrase now.');
                // get my plublic key
                var blockprism_url = bg_page.server_address + '/public_key/facebook/';
                $.get(blockprism_url, {facebook_id: localStorage.getItem('my_facebook_id')})
                    .done( function(response) {
                            localStorage.setItem('my_public_key', response);
                            login_success();
                            // $('#public_key').text(response);
                            // $('#public_key_info').show();
                        })
                    .fail( function(xhr, textStatus, errorThrown) {
                            // $('#public_key_info').hide();
                            login_success();
                        });
            })
            .fail( function (xhr, textStatus, errorThrown) {
                set_error('Facebook authentication failed.');
            });
    });
}

function logout() {
    logout_success();
    localStorage.removeItem('my_facebook_id');
    localStorage.removeItem('my_rsa_key');
    localStorage.removeItem('my_access_token');
    localStorage.removeItem('my_public_key');
    facebook.clearAccessToken();
    set_info('Logout successful!');
    chrome.tabs.query({url: "*://*.facebook.com/*"}, function(tabs) {
        $.each(tabs, function(index, tab) {
            chrome.tabs.reload(tab.id);
        });
    });
}

$(document).ready(function() {
    if(localStorage.getItem('my_facebook_id')) {
        login_success(localStorage.getItem('my_facebook_id'));
    }
    else if(facebook.getAccessToken()) {
        login();
    }
    else {
        logout_success();
    }

    $('#logout').click( function() {
        logout();
    });

    $('#login').click( function() {
        login();
    });

    $('#generate_key_pair').click( function() {
        disable_elements(['#passphrase', '#passphrase_2', '#generate_key_pair']);
        var passphrase = $('#passphrase').val();
        if (passphrase.length < 10) {
            set_error('Please enter a passphrase with at least 10 chars.');
            enable_elements(['#passphrase', '#passphrase_2', '#generate_key_pair']);
        }
        else if(!passphrase.match(/[A-Z]/) || !passphrase.match(/[a-z]/) || !passphrase.match(/[0-9]/)) {
            set_error('Your passphrase has to contain at least one upper case and one lower case character and a number.');
            enable_elements(['#passphrase', '#passphrase_2', '#generate_key_pair']);
        }
        else if(!localStorage.getItem('my_public_key') && passphrase != $('#passphrase_2').val()) {
            set_error('Your passphrases don\'t match.');
            enable_elements(['#passphrase', '#passphrase_2', '#generate_key_pair']);
        }
        else {
            set_info('Key pair will be generated.');
            $('#loading').show();
            generate_key_pair(localStorage.getItem('my_facebook_id') + '_' + passphrase, function(rsa_key) {
                $('#loading').hide();
                var public_key = cryptico.publicKeyString(rsa_key);
                // user has already a key pair
                if (localStorage.getItem('my_public_key')) {
                    $('#passphrase').val('');
                    $('#passphrase_2').val('');
                    if (localStorage.getItem('my_public_key') == public_key) {
                        set_info('Your passphrase was correct. You are ready to go!');
                        localStorage.setItem('my_rsa_key', JSON.stringify(rsa_key));
                        $('#key_generation_info').hide();
                        enable_elements(['#passphrase', '#passphrase_2', '#generate_key_pair']);
                        chrome.tabs.query({url: "*://*.facebook.com/*"}, function(tabs) {
                            $.each(tabs, function(index, tab) {
                                chrome.tabs.sendMessage(tab.id, {action: 'public_key_ready'});
                            });
                        });
                    }
                    else {
                        set_error('Your passphrase was not correct. Please try again!');
                        enable_elements(['#passphrase', '#passphrase_2', '#generate_key_pair']);
                    }
                }
                // key pair has to be registered
                else {
                    // $('#public_key').text(public_key);
                    // $('#public_key_info').show();
                    var blockprism_url = bg_page.server_address + '/public_key/facebook/';
                    $.post( blockprism_url, 
                            {
                                facebook_id: localStorage.getItem('my_facebook_id'),
                                access_token: localStorage.getItem('my_access_token'),
                                public_key: public_key
                            })
                        .done( function(response) {
                            localStorage.setItem('my_rsa_key', JSON.stringify(rsa_key));
                            localStorage.setItem('my_public_key', public_key);
                            localStorage.removeItem('my_access_token');
                            set_info("Your key pair was created and the public key was sent to the server. You are ready to go!");
                            $('#passphrase').val('');
                            $('#passphrase_2').val('');
                            $('#key_generation_info').hide();
                            enable_elements(['#passphrase', '#passphrase_2', '#generate_key_pair']);
                            chrome.tabs.query({url: "*://*.facebook.com/*"}, function(tabs) {
                                $.each(tabs, function(index, tab) {
                                    chrome.tabs.sendMessage(tab.id, {action: 'public_key_ready'});
                                });
                            });
                        })
                        .fail( function(xhr, textStatus, errorThrown) {
                            set_error("Your key pair was created but the public key couldn't be sent to the server. Please try again.");
                            enable_elements(['#passphrase', '#passphrase_2', '#generate_key_pair']);
                        });
                }
            });
        }
    });
});