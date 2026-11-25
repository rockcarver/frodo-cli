/*
 * Copyright 2025 Ping Identity Corporation. All Rights Reserved
 *
 * This code is to be used exclusively in connection with Ping Identity
 * Corporation software or services. Ping Identity Corporation only offers
 * such software or services to legal entities who have entered into a
 * binding license agreement with Ping Identity Corporation.
 */

/**
 * Example cache loader script. This script is called when a cache entry is
 * requested that has not yet been loaded. The script returns the `value`
 * in the <code>key</code> object.
 *
 * @param key {object} of string to string
 * @returns {string}, but can also return {object}, {array}, {number}, {boolean}
 */
function load(key) {
    return key.value;
}

/**
 * Example reload function, this is called to refresh an existing cache entry. This simple example
 * ignores the old value and returns the first value in the <code>key</code> array.
 * @param key {object} of string to string
 * @param oldValue {string}, but could be {object}, {array}, {number}, {boolean}, the previous value associated
 *                 with the key
 * @returns {string}, but can also return {object}, {array}, {number}, {boolean}
 */
function reload(key, oldValue) {
    return load(key);
}
