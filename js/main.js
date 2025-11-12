// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// Main initialization

function onDocumentLoad() {
    new Runner('.interstitial-wrapper');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onDocumentLoad);
} else {
    // DOM is already loaded
    onDocumentLoad();
}

