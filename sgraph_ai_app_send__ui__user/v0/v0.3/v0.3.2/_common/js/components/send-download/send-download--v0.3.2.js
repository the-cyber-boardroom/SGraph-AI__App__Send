/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — v0.3.2 surgical overlay for send-download.js

   Overrides _renderBrowseView to create a ZipDataSource and pass it to
   send-browse via the dataSource property (v0.3.2 data source interface).
   ═══════════════════════════════════════════════════════════════════════════════ */

SendDownload.prototype._renderBrowseView = function() {
    var browse = document.createElement('send-browse');

    // Create ZipDataSource adapter (v0.3.2 interface)
    if (typeof ZipDataSource !== 'undefined') {
        browse.dataSource = new ZipDataSource(
            this._zipInstance, this._zipTree, this._zipOrigBytes, this._zipOrigName
        );
    }

    // Legacy properties (backward compat — browse auto-creates ZipDataSource from these if no dataSource)
    browse.zipTree      = this._zipTree;
    browse.zipInstance   = this._zipInstance;
    browse.zipOrigBytes  = this._zipOrigBytes;
    browse.zipOrigName   = this._zipOrigName;

    browse.fileName      = this._zipOrigName;
    browse.transferId    = this.transferId;
    browse.downloadUrl   = this._downloadUrl;
    this.innerHTML = '';
    this.appendChild(browse);
};
