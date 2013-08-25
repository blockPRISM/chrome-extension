/*
 * Copyright 2013 Stefan George & Felix Leupold
 */
 
var public_key_dict = {};
var my_rsa_key = null;
var my_public_key = null;
var my_facebook_id = null;

var pressed_keys = { length: 0 };
var icon_lock_open_url = chrome.extension.getURL("images/lock_open.png");
var icon_lock_closed_url = chrome.extension.getURL("images/lock_closed.png");
var icon_lock_na_url = chrome.extension.getURL("images/lock_na.png");

function extract_facebook_id(url) {
    var results = url.match(/https{0,1}:\/\/www.facebook.com\/(.*)/)[1].split('?')
    if (results[0] == 'profile.php') {
        return results[1].substr(3);
    }
    return results[0];
}

function encrypt_message(message, friend_facebook_id) {
    if (message.trim() && public_key_dict.hasOwnProperty(friend_facebook_id) && public_key_dict[friend_facebook_id].enabled) {
        // encrypt message
        message = message.trim();
        var my_cipher = cryptico.encrypt(message, my_public_key).cipher;
        var friend_cipher = cryptico.encrypt(message, public_key_dict[friend_facebook_id].public_key).cipher;
        var message = 'BLOCKPRISM.ORG_' + my_facebook_id + "@" + my_cipher + "BLOCKPRISM.ORG_" + friend_facebook_id + "@" + friend_cipher;
        return message;
    }
    else {
        return message;
    }
}

function decrypt_message(message) {
    // is message encrypted
    if (message.substr(0, 15) == 'BLOCKPRISM.ORG_') {
        var ciphers = message.match(/BLOCKPRISM.ORG_(.*)BLOCKPRISM.ORG_(.*)/).slice(1);
        for (var i=0; i < ciphers.length; i++) {
            var username_cipher = ciphers[i].split('@');
            // is this my cipher?
            if (username_cipher[0] == my_facebook_id) {
                // decrypt message 
                var plaintext = cryptico.decrypt(username_cipher[1], my_rsa_key).plaintext;
                if (plaintext) {
                    return plaintext;
                }
                else {
                    return message;
                }
            }
            // is friend's cipher
            else if(!public_key_dict.hasOwnProperty(username_cipher[0])) {
                get_public_key(username_cipher[0], true);
            }
        }
    }
    else {
        return message;
    }
}

function get_public_key(friend_facebook_id, force) {
    if (!public_key_dict.hasOwnProperty(friend_facebook_id)) {
        chrome.extension.sendMessage(
            {
                action: 'get_public_key', 
                friend_facebook_id: friend_facebook_id,
                force: force
            },
            function(response){
                if (!response.error) {
                    public_key_dict[friend_facebook_id] = response;
                }
                set_icons(friend_facebook_id);
            }
        );
    }
    else {
        set_icons(friend_facebook_id);
    }
}

function add_click_event_handler(el) {
    el.on('click', function() {
        var friend_facebook_id = $(this).attr('fb-id');
        if (public_key_dict.hasOwnProperty(friend_facebook_id)) {
            if(public_key_dict[friend_facebook_id].enabled) {
                var status = false;
                var icon = icon_lock_open_url;
            }
            else {
                var status = true;
                var icon = icon_lock_closed_url;
            }
            chrome.extension.sendMessage({
                action: 'set_encryption_status', 
                friend_facebook_id: friend_facebook_id,
                status: status
            });
            public_key_dict[friend_facebook_id].enabled = status;
            $('img[fb-id="' + friend_facebook_id + '"]').attr('src', icon);
        }
        else {
            get_public_key(friend_facebook_id, true);
        }
    });
}

function insert_icon(facebook_id, target, icon, css_class) {
    var img = $('.blockprism-lock', $(target));
    if (img.length) {
        img.attr('src', icon);
    }
    else {
        var img = '<img fb-id="' + facebook_id + '" src="' + icon + '" class="blockprism-lock ' + css_class + '" />';
        if (css_class == 'bp-chat-box') {
            $(target).append(img);
        }
        else {
            $(target).prepend(img);
        }
        add_click_event_handler($('.blockprism-lock', $(target)));
    }
}

function set_icons(facebook_id) {
    // add lock icons
    if (public_key_dict.hasOwnProperty(facebook_id)) {
        if(public_key_dict[facebook_id].enabled) {
            var icon = icon_lock_closed_url;
        }
        else {
            var icon = icon_lock_open_url;
        }
    }
    else {
        var icon = icon_lock_na_url;
    }
    // add icon to chat box
    $('.titlebarText').each(function(index) {
        var friend_facebook_id = extract_facebook_id($(this).attr('href'));
        if (facebook_id == friend_facebook_id) {
            if ($('._552n').length) {
                var target = $('._552n', $(this).parent().parent().parent().parent());
            }
            else {
                var target = $('.-cx-PRIVATE-fbMercuryChatTab__chaticonscontainer', $(this).parent().parent().parent().parent());
            }
            insert_icon(facebook_id, target, icon, 'bp-chat-box');
        }
    });
    // add icons to message overview
    if($('#webMessengerHeaderName a').length == 1) {
        var friend_facebook_id = extract_facebook_id($('#webMessengerHeaderName a').attr('href'));
        if(facebook_id == friend_facebook_id) {
            var target = $('#webMessengerHeaderName a').parent();
            var img = $('.blockprism-lock', $(target));
            insert_icon(facebook_id, target, icon, 'bp-message-overview');
        }
    }
}

function decrypt_messages(el) {
    el.each(function(index) {
        $(this).text(decrypt_message($(this).text()));
        $(this).addClass('blockprism');
    });
}

function decrypt_loaded_messages() {
    // decrypt chat box
    decrypt_messages($('div[data-jsid=message]:not(.blockprism)').not('.metaInfoContainer'));
    // decrypt message overview
    decrypt_messages($('#webMessengerRecentMessages p:not(.blockprism)'));
    // get public key chat box
    $('.titlebarText').each(function(index) {
        // is not a group conversation
        if ($(this).attr('href')) {
            var friend_profile_link = $(this).attr('href');
            var friend_facebook_id = extract_facebook_id(friend_profile_link);
            get_public_key(friend_facebook_id);
        }
    });
    // get public key message overview
    if ($('#webMessengerHeaderName a').length == 1) {
        var friend_profile_link = $('#webMessengerHeaderName a').attr('href');
        var friend_facebook_id = extract_facebook_id(friend_profile_link);
        get_public_key(friend_facebook_id);
    }
}

function decrypt_messages_listener() {
    // on dom modification
    $(".titlebarText").on("DOMSubtreeModified", function() {
        if ($(this).attr('href')) {
            var friend_profile_link = $(this).attr('href');
            var friend_facebook_id = extract_facebook_id(friend_profile_link);
            get_public_key(friend_facebook_id);
        }
    });
    $("#webMessengerHeaderName a").on("DOMSubtreeModified", function() {
        if ($(this).length == 1 && $(this).attr('href')) {
            var friend_profile_link = $(this).attr('href');
            var friend_facebook_id = extract_facebook_id(friend_profile_link);
            get_public_key(friend_facebook_id);
        }
    });
    // decrypt chat box
    insertionQ('div[data-jsid=message]:not(.blockprism)').every(function(div) {
        $(div).text(decrypt_message($(div).text()));
        $(div).addClass('blockprism');
    });
    // decrypt message overview
    insertionQ('#webMessengerRecentMessages p:not(.blockprism)').every(function(p) {
        $(p).text(decrypt_message($(p).text()));
        $(p).addClass('blockprism');
    });
    // get public key chat box
    insertionQ('.titlebarText').every(function(a) {
        if ($(a).attr('href')) {
            var friend_profile_link = $(a).attr('href');
            var friend_facebook_id = extract_facebook_id(friend_profile_link);
            get_public_key(friend_facebook_id, false);
        }
    });
    // get public key message overview
    insertionQ('#webMessengerHeaderName a').every(function(a) {
        if ($('#webMessengerHeaderName a').length == 1) {
            var friend_profile_link = $(a).attr('href');
            var friend_facebook_id = extract_facebook_id(friend_profile_link);
            get_public_key(friend_facebook_id, false);
        }
    });
}

function encrypt_messages_listener() {
    var special_keys = [8, 9, 16, 17, 18, 19, 20, 27, 33, 34, 35, 36, 37, 38, 39, 40, 44, 45,
                        46, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 144, 145];
    window.addEventListener('keyup', function(event) {
        var keycode = event.keyCode;
        if (special_keys.indexOf(keycode) != -1) {
            if (pressed_keys[keycode]) {
                pressed_keys[keycode] = false;
                pressed_keys.length--;
            }
        }
    });
    window.addEventListener('keydown', function(event) {
        var keycode = event.keyCode;
        if (special_keys.indexOf(keycode) != -1) {
            if (!pressed_keys[keycode]) {
                pressed_keys[keycode] = true;
                pressed_keys.length++;
            }
        }
        if (keycode == '13' && pressed_keys.length == 0) {
            // encrypt chat box
            if ($.inArray(event.target, $('.fbDockChatTabFlyout textarea')) > -1) {
                var friend_profile_link = $('a.titlebarText', $(event.target).parent().parent().parent()).attr("href");
                if(friend_profile_link) {
                    var friend_facebook_id = extract_facebook_id(friend_profile_link);
                    event.target.value = encrypt_message(event.target.value, friend_facebook_id);
                }
            }
            // encrypt message overview
            else if ($.inArray(event.target, $('textarea[name=message_body]')) > -1 && $('input[value=Reply]').attr('tabindex') == '-1') {
                if ($('#webMessengerHeaderName a').length == 1) {
                    var friend_profile_link = $('#webMessengerHeaderName a').attr('href');
                    var friend_facebook_id = extract_facebook_id(friend_profile_link);
                    event.target.value = encrypt_message(event.target.value, friend_facebook_id);
                }
            }
        }
    }, true);
    window.addEventListener('click', function(event) {
        if ($.inArray(event.target, $('input[value=Reply]')) > -1) {
            if ($('#webMessengerHeaderName a').length == 1) {
                var friend_profile_link = $('#webMessengerHeaderName a').attr('href');
                var friend_facebook_id = extract_facebook_id(friend_profile_link);
                $('textarea[name=message_body]').val(encrypt_message($('textarea[name=message_body]').val(), friend_facebook_id));
            }
        }
    }, true);
}

function inject_encryption() {
    // decrypt loaded messages
    decrypt_loaded_messages();
    // add listener to decrypt new messages and get public keys
    decrypt_messages_listener();
    // add listener to encrypt messages 
    encrypt_messages_listener();
}

function cast_to_rsa_key(rsa_key) {
    // cast to BigInteger
    rsa_key.n.__proto__ = BigInteger.prototype;
    rsa_key.d.__proto__ = BigInteger.prototype;
    rsa_key.p.__proto__ = BigInteger.prototype;
    rsa_key.q.__proto__ = BigInteger.prototype;
    rsa_key.dmp1.__proto__ = BigInteger.prototype;
    rsa_key.dmq1.__proto__ = BigInteger.prototype;
    rsa_key.coeff.__proto__ = BigInteger.prototype;
    rsa_key.__proto__ = RSAKey.prototype;
    return rsa_key;
}

function get_my_key_pair() {
    chrome.extension.sendMessage(
        {
            action: 'get_my_key_pair', 
            my_facebook_id: my_facebook_id
        }, 
        function(response) {
            if (!response.error) {
                my_rsa_key = cast_to_rsa_key(response);
                my_public_key = cryptico.publicKeyString(my_rsa_key);
                inject_encryption();
            }
        }
    );
}

chrome.extension.onMessage.addListener(
    function(request, sender, sendResponse) {
        if (request.action == 'public_key_ready') {
            get_my_key_pair();
        }
    }
);

$(document).ready(function() {
    // get my facebook id
    if ($('.navLink[accesskey=2]').length) {
        var my_facebook_link = $('.navLink[accesskey=2]').attr('href');
    }
    else if ($('#sidebar_navigation_top a').length) {
        var my_facebook_link = $($('#sidebar_navigation_top a')[0]).attr('href');
    }
    my_facebook_id = extract_facebook_id(my_facebook_link);
    // get my key pair
    get_my_key_pair();
});