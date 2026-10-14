// Fills in the newest release number from GitHub. Without it the links still work.
(function () {
  var els = document.querySelectorAll("[data-version]");
  if (!els.length || !window.fetch) return;
  fetch("https://api.github.com/repos/nreed97/QRZero/releases?per_page=1")
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (list) {
      if (!list.length) return;
      var m = /(\d+\.\d+(\.\d+)?)/.exec(list[0].tag_name);
      if (!m) return;
      els.forEach(function (e) { e.textContent = "v" + m[1]; });
    })
    .catch(function () {});
})();
