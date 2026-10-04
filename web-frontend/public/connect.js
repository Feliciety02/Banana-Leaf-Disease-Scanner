// The app reads the server address from dahonmd://server?url=...
(function () {
  var server = encodeURIComponent(window.location.origin);
  var android = /android/i.test(navigator.userAgent);
  document.getElementById('open-app').href = android
    ? 'intent://server?url=' + server + '#Intent;scheme=dahonmd;package=com.dahonmd.field;end'
    : 'dahonmd://server?url=' + server;
})();
