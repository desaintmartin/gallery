/**
 * Nextcloud - Gallery
 *
 *
 * This file is licensed under the Affero General Public License version 3 or
 * later. See the COPYING file.
 *
 * @author Olivier Paroz <galleryapps@oparoz.com>
 *
 * @copyright Olivier Paroz 2017
 */
/* global Handlebars, Gallery, Thumbnails */
(function ($, _, OC, t, Gallery) {
	"use strict";

	var TEMPLATE_ADDBUTTON = '<a href="#" class="button new"><span class="icon icon-add"></span><span class="hidden-visually">New</span></a>';
	var TEMPLATE_DOWNLOADBUTTON = '<span id="selectedActionsList" class="selectedActions hidden"><a href="#" class="button download"><span class="icon icon-download"></span><span class="hidden-visually">Download</span></a></span>';

	/**
	 * Builds and updates the Gallery view
	 *
	 * @constructor
	 */
	var View = function () {
		this.element = $('#gallery');
		this.loadVisibleRows.loading = false;
		this._setupUploader();
		this.breadcrumb = new Gallery.Breadcrumb();
		this.emptyContentElement = $('#emptycontent');
		this.controlsElement = $('#controls');
	};

	View.prototype = {
		element: null,
		breadcrumb: null,
		requestId: -1,
		emptyContentElement: null,
		controlsElement: null,
		/**
		 * Map of file id to file data
		 * @type Object.<int, Object>
		 */
		_selectedFiles: {},
		/**
		 * Summary of selected files.
		 * @type OCA.Files.FileSummary
		 */
		_selectionSummary: null,
		/**
		 * @type Backbone.Model
		 */
		_filesConfig: undefined,

		/**
		 * Removes all thumbnails from the view
		 */
		clear: function () {
			this.loadVisibleRows.processing = false;
			this.loadVisibleRows.loading = null;
			// We want to keep all the events
			this.element.children().detach();
			this.showLoading();
		},

		/**
		 * @param {string} path
		 * @returns {boolean}
		 */
		_isValidPath: function(path) {
			var sections = path.split('/');
			for (var i = 0; i < sections.length; i++) {
				if (sections[i] === '..') {
					return false;
				}
			}

			return path.toLowerCase().indexOf(decodeURI('%0a')) === -1 &&
				path.toLowerCase().indexOf(decodeURI('%00')) === -1;
		},

		/**
		 * Populates the view if there are images or albums to show
		 *
		 * @param {string} albumPath
		 * @param {string|undefined} errorMessage
		 */
		init: function (albumPath, errorMessage) {
			// Set path to an empty value if not a valid one
			if(!this._isValidPath(albumPath)) {
				albumPath = '';
			}

			// Only do it when the app is initialised
			if (this.requestId === -1) {
				this._initButtons();
				this._blankUrl();
			}
			if ($.isEmptyObject(Gallery.imageMap)) {
				Gallery.view.showEmptyFolder(albumPath, errorMessage);
			} else {
				this.viewAlbum(albumPath);
			}

			this._setBackgroundColour();

			this._initSelection();
		},

		/**
		 * Starts the slideshow
		 *
		 * @param {string} path
		 * @param {string} albumPath
		 */
		startSlideshow: function (path, albumPath) {
			var album = Gallery.albumMap[albumPath];
			var images = album.images;
			var startImage = Gallery.imageMap[path];
			Gallery.slideShow(images, startImage, false);
		},

		/**
		 * Sets up the controls and starts loading the gallery rows
		 *
		 * @param {string|null} albumPath
		 */
		viewAlbum: function (albumPath) {
			albumPath = albumPath || '';
			if (!Gallery.albumMap[albumPath]) {
				return;
			}

			this.clear();

			if (albumPath !== Gallery.currentAlbum
				|| (albumPath === Gallery.currentAlbum &&
				Gallery.albumMap[albumPath].etag !== Gallery.currentEtag)) {
				Gallery.currentAlbum = albumPath;
				Gallery.currentEtag = Gallery.albumMap[albumPath].etag;
				this._setupButtons(albumPath);
			}

			Gallery.albumMap[albumPath].viewedItems = 0;
			Gallery.albumMap[albumPath].preloadOffset = 0;

			// Each request has a unique ID, so that we can track which request a row belongs to
			this.requestId = Math.random();
			Gallery.albumMap[Gallery.currentAlbum].requestId = this.requestId;

			// Loading rows without blocking the execution of the rest of the script
			setTimeout(function () {
				this.loadVisibleRows.activeIndex = 0;
				this.loadVisibleRows(Gallery.albumMap[Gallery.currentAlbum]);
			}.bind(this), 0);
		},

		/**
		 * Manages the sorting interface
		 *
		 * @param {string} sortType name or date
		 * @param {string} sortOrder asc or des
		 */
		sortControlsSetup: function (sortType, sortOrder) {
			var reverseSortType = 'date';
			if (sortType === 'date') {
				reverseSortType = 'name';
			}
			this._setSortButton(sortType, sortOrder, true);
			this._setSortButton(reverseSortType, 'asc', false); // default icon
		},

		/**
		 * Loads and displays gallery rows on screen
		 *
		 * view.loadVisibleRows.loading holds the Promise of a row
		 *
		 * @param {Album} album
		 */
		loadVisibleRows: function (album) {
			var view = this;
			// Wait for the previous request to be completed
			if (this.loadVisibleRows.processing) {
				return;
			}

			/**
			 * At this stage, there is no loading taking place, so we can look for new rows
			 */

			var scroll = $('#content-wrapper').scrollTop() + $(window).scrollTop();
			// 2 windows worth of rows is the limit from which we need to start loading new rows.
			// As we scroll down, it grows
			var targetHeight = ($(window).height() * 2) + scroll;
			// We throttle rows in order to try and not generate too many CSS resizing events at
			// the same time
			var showRows = _.throttle(function (album) {

				// If we've reached the end of the album, we kill the loader
				if (!(album.viewedItems < album.subAlbums.length + album.images.length)) {
					view.loadVisibleRows.processing = false;
					view.loadVisibleRows.loading = null;
					return;
				}

				// Prevents creating rows which are no longer required. I.e when changing album
				if (view.requestId !== album.requestId) {
					return;
				}

				// We can now safely create a new row
				var row = album.getRow($(window).width());
				var rowDom = row.getDom();
				view.element.append(rowDom);

				return album.fillNextRow(row).then(function () {
					if (album.viewedItems < album.subAlbums.length + album.images.length &&
						view.element.height() < targetHeight) {
						return showRows(album);
					}
					// No more rows to load at the moment
					view.loadVisibleRows.processing = false;
					view.loadVisibleRows.loading = null;
				}, function () {
					// Something went wrong, so kill the loader
					view.loadVisibleRows.processing = false;
					view.loadVisibleRows.loading = null;
				});
			}, 100);
			if (this.element.height() < targetHeight) {
				this._showNormal();
				this.loadVisibleRows.processing = true;
				album.requestId = view.requestId;
				this.loadVisibleRows.loading = showRows(album);
			}
		},

		/**
		 * Shows an empty gallery message
		 *
		 * @param {string} albumPath
		 * @param {string|null} errorMessage
		 */
		showEmptyFolder: function (albumPath, errorMessage) {
			var message = '<div class="icon-gallery"></div>';
			var uploadAllowed = true;

			this.element.children().detach();
			this.removeLoading();

			if (!_.isUndefined(errorMessage) && errorMessage !== null) {
				message += '<h2>' + t('gallery',
						'Album cannot be shown') + '</h2>';
				message += '<p>' + escapeHTML(errorMessage) + '</p>';
				uploadAllowed = false;
			} else {
				message += '<h2>' + t('gallery',
						'No media files found') + '</h2>';
				// We can't upload yet on the public side
				if (Gallery.token) {
					message += '<p>' + t('gallery',
							'Upload pictures in the Files app to display them here') + '</p>';
				} else {
					message += '<p>' + t('gallery',
							'Upload new files via drag and drop or by using the [+] button above') +
						'</p>';
				}
			}
			this.emptyContentElement.html(message);
			this.emptyContentElement.removeClass('hidden');

			this._hideButtons(uploadAllowed);
			Gallery.currentAlbum = albumPath;
			var availableWidth = $(window).width() - Gallery.buttonsWidth;
			this.breadcrumb.init(albumPath, availableWidth);
			Gallery.config.albumDesign = null;
		},

		/**
		 * Dims the controls bar when retrieving new content. Matches the effect in Files
		 */
		dimControls: function () {
			// Use the existing mask if its already there
			var $mask = this.controlsElement.find('.mask');
			if ($mask.exists()) {
				return;
			}
			$mask = $('<div class="mask transparent"></div>');
			this.controlsElement.append($mask);
			$mask.removeClass('transparent');
		},

		/**
		 * Shows the infamous loading spinner
		 */
		showLoading: function () {
			this.emptyContentElement.addClass('hidden');
			this.controlsElement.removeClass('hidden');
			$('#content').addClass('icon-loading');
			this.dimControls();
		},

		/**
		 * Removes the spinner in the main area and restore normal visibility of the controls bar
		 */
		removeLoading: function () {
			$('#content').removeClass('icon-loading');
			this.controlsElement.find('.mask').remove();
		},

		/**
		 * Shows thumbnails
		 */
		_showNormal: function () {
			this.emptyContentElement.addClass('hidden');
			this.controlsElement.removeClass('hidden');
			this.removeLoading();
		},

		/**
		 * Sets up our custom handlers for folder uploading operations
		 *
		 * @see OC.Upload.init/file_upload_param.done()
		 *
		 * @private
		 */
		_setupUploader: function () {
			var $uploadEl = $('#file_upload_start');
			if (!$uploadEl.exists()) {
				return;
			}
			this._uploader = new OC.Uploader($uploadEl, {
				fileList: FileList,
				dropZone: $('#content')
			});
			this._uploader.on('add', function (e, data) {
				data.targetDir = '/' + Gallery.currentAlbum;
			});
			this._uploader.on('done', function (e, upload) {
				var data = upload.data;

				// is that the last upload ?
				if (data.files[0] === data.originalFiles[data.originalFiles.length - 1]) {
					var fileList = data.originalFiles;
					//Ask for a refresh of the photowall
					Gallery.getFiles(Gallery.currentAlbum).done(function () {
						var fileId, path;
						// Removes the cached thumbnails of files which have been re-uploaded
						_(fileList).each(function (fileName) {
							path = Gallery.currentAlbum + '/' + fileName;
							if (Gallery.imageMap[path]) {
								fileId = Gallery.imageMap[path].fileId;
								if (Thumbnails.map[fileId]) {
									delete Thumbnails.map[fileId];
								}
							}
						});

						Gallery.view.init(Gallery.currentAlbum);
					});
				}
			});

			// Since Nextcloud 9.0
			if (OC.Uploader) {
				OC.Uploader.prototype._isReceivedSharedFile = function (file) {
					var path = file.name;
					var sharedWith = false;

					if (Gallery.currentAlbum !== '' && Gallery.currentAlbum !== '/') {
						path = Gallery.currentAlbum + '/' + path;
					}
					if (Gallery.imageMap[path] && Gallery.imageMap[path].sharedWithUser) {
						sharedWith = true;
					}

					return sharedWith;
				};
			}
		},

		/**
		 * Setups selection feature
		 *
		 * @private
		 */
		_initSelection: function() {
			this._selectedFiles = {};
			this._filesConfig = new OC.Backbone.Model();
			this._selectionSummary = new OCA.Files.FileSummary(undefined, {config: this._filesConfig});
			this.element.on('click', '.row-element>.image-label>label', _.bind(this._onClickFile, this));
			this.element.on('change', '.selectCheckBox', _.bind(this._onClickFileCheckbox, this));
		},

		/**
		 * Adds all the click handlers to buttons the first time they appear in the interface
		 *
		 * @private
		 */
		_initButtons: function () {
			this.element.on("contextmenu", function(e) { e.preventDefault(); });
			$('#filelist-button').click(Gallery.switchToFilesView);
			$('#download').click(Gallery.download);
			$('#shared-button').click(Gallery.share);
			Gallery.infoBox = new Gallery.InfoBox();
			$('#album-info-button').click(Gallery.showInfo);
			$('#sort-name-button').click(Gallery.sorter);
			$('#sort-date-button').click(Gallery.sorter);
			$('#save #save-button').click(Gallery.showSaveForm);
			$('.save-form').submit(Gallery.saveForm);
			this._renderDownloadButton();
			this._renderNewButton();
			// Trigger cancelling of file upload
			$('#uploadprogresswrapper .stop').on('click', function () {
				OC.Upload.cancelUploads();
			});
			this.requestId = Math.random();
		},

		/**
		 * Sets up all the buttons of the interface and the breadcrumbs
		 *
		 * @param {string} albumPath
		 * @private
		 */
		_setupButtons: function (albumPath) {
			this._shareButtonSetup(albumPath);
			this._infoButtonSetup();

			var availableWidth = $(window).width() - Gallery.buttonsWidth;
			this.breadcrumb.init(albumPath, availableWidth);
			var album = Gallery.albumMap[albumPath];

			var sum = album.images.length + album.subAlbums.length;
			//If sum of the number of images and subalbums exceeds 1 then show the buttons.
			if(sum > 1)
			{
				$('#sort-name-button').show();
				$('#sort-date-button').show();
			}
			else
			{
				$('#sort-name-button').hide();
				$('#sort-date-button').hide();
			}
			var currentSort = Gallery.config.albumSorting;
			this.sortControlsSetup(currentSort.type, currentSort.order);
			Gallery.albumMap[Gallery.currentAlbum].images.sort(
				Gallery.utility.sortBy(currentSort.type,
					currentSort.order));
			Gallery.albumMap[Gallery.currentAlbum].subAlbums.sort(Gallery.utility.sortBy('name',
				currentSort.albumOrder));

			$('#save-button').show();
			$('#download').show();
			$('a.button.new').show();
		},

		/**
		 * Hide buttons in the controls bar
		 *
		 * @param uploadAllowed
		 */
		_hideButtons: function (uploadAllowed) {
			$('#album-info-button').hide();
			$('#shared-button').hide();
			$('#sort-name-button').hide();
			$('#sort-date-button').hide();
			$('#save-button').hide();
			$('#download').hide();

			if (!uploadAllowed) {
				$('a.button.new').hide();
			}
		},

		/**
		 * Shows or hides the share button depending on if we're in a public gallery or not
		 *
		 * @param {string} albumPath
		 * @private
		 */
		_shareButtonSetup: function (albumPath) {
			var shareButton = $('#shared-button');
			if (albumPath === '' || Gallery.token) {
				shareButton.hide();
			} else {
				shareButton.show();
			}
		},

		/**
		 * Shows or hides the info button based on the information we've received from the server
		 *
		 * @private
		 */
		_infoButtonSetup: function () {
			var infoButton = $('#album-info-button');
			infoButton.find('span').hide();
			var infoContentContainer = $('.album-info-container');
			infoContentContainer.slideUp();
			infoContentContainer.css('max-height',
				$(window).height() - Gallery.browserToolbarHeight);
			var albumInfo = Gallery.config.albumInfo;
			if (Gallery.config.albumError) {
				infoButton.hide();
				var text = '<strong>' + t('gallery', 'Configuration error') + '</strong></br>' +
					Gallery.config.albumError.message + '</br></br>';
				Gallery.utility.showHtmlNotification(text, 7);
			} else if ($.isEmptyObject(albumInfo)) {
				infoButton.hide();
			} else {
				infoButton.show();
				if (albumInfo.inherit !== 'yes' || albumInfo.level === 0) {
					infoButton.find('span').delay(1000).slideDown();
				}
			}
		},

		/**
		 * Sets the background colour of the photowall
		 *
		 * @private
		 */
		_setBackgroundColour: function () {
			var wrapper = $('#content-wrapper');
			var albumDesign = Gallery.config.albumDesign;
			if (!$.isEmptyObject(albumDesign) && albumDesign.background) {
				wrapper.css('background-color', albumDesign.background);
			} else {
				wrapper.css('background-color', '#fff');
			}
		},

		/**
		 * Picks the image which matches the sort order
		 *
		 * @param {string} sortType name or date
		 * @param {string} sortOrder asc or des
		 * @param {boolean} active determines if we're setting up the active sort button
		 * @private
		 */
		_setSortButton: function (sortType, sortOrder, active) {
			var button = $('#sort-' + sortType + '-button');
			// Removing all the classes which control the image in the button
			button.removeClass('active');
			button.find('img').removeClass('front');
			button.find('img').removeClass('back');

			// We need to determine the reverse order in order to send that image to the back
			var reverseSortOrder = 'des';
			if (sortOrder === 'des') {
				reverseSortOrder = 'asc';
			}

			// We assign the proper order to the button images
			button.find('img.' + sortOrder).addClass('front');
			button.find('img.' + reverseSortOrder).addClass('back');

			// The active button needs a hover action for the flip effect
			if (active) {
				button.addClass('active');
				if (button.is(":hover")) {
					button.removeClass('hover');
				}
				// We can't use a toggle here
				button.hover(function () {
						$(this).addClass('hover');
					},
					function () {
						$(this).removeClass('hover');
					});
			}
		},

		/**
		 * If no url is entered then do not show the error box.
		 *
		 */
		_blankUrl: function() {
			$('#remote_address').on("change keyup paste", function() {
 				if ($(this).val() === '') {
 					$('#save-button-confirm').prop('disabled', true);
 				} else {
 					$('#save-button-confirm').prop('disabled', false);
 				}
			});
		},

		/**
		 * Creates the [+] button allowing users who can't drag and drop to upload files
		 *
		 * @see core/apps/files/js/filelist.js
		 * @private
		 */
		_renderNewButton: function () {
			// if no actions container exist, skip
			var $actionsContainer = $('.actions.creatable');
			if (!$actionsContainer.length) {
				return;
			}
			if (!this._addButtonTemplate) {
				this._addButtonTemplate = Handlebars.compile(TEMPLATE_ADDBUTTON);
			}
			var $newButton = $(this._addButtonTemplate({
				addText: t('gallery', 'New'),
				iconUrl: OC.imagePath('core', 'actions/add')
			}));

			$actionsContainer.prepend($newButton);
			$newButton.tooltip({'placement': 'bottom'});

			$newButton.click(_.bind(this._onClickNewButton, this));
			this._newButton = $newButton;
		},

		/**
		 * Creates the click handler for the [+] button
		 * @param event
		 * @returns {boolean}
		 *
		 * @see core/apps/files/js/filelist.js
		 * @private
		 */
		_onClickNewButton: function (event) {
			var $target = $(event.target);
			if (!$target.hasClass('.button')) {
				$target = $target.closest('.button');
			}
			this._newButton.tooltip('hide');
			event.preventDefault();
			if ($target.hasClass('disabled')) {
				return false;
			}
			if (!this._newFileMenu) {
				this._newFileMenu = new Gallery.NewFileMenu();
				$('.actions').append(this._newFileMenu.$el);
			}
			this._newFileMenu.showAt($target);

			if (Gallery.currentAlbum === '') {
				$('.menuitem[data-action="hideAlbum"]').parent().hide();
			}
			return false;
		},

		/**
		 * Creates the download button
		 *
		 * @see core/apps/files/js/filelist.js
		 * @private
		 */
		_renderDownloadButton: function () {
			var $actionsContainer = $('#controls .right');
			if (!this._downloadButtonTemplate) {
				this._downloadButtonTemplate = Handlebars.compile(TEMPLATE_DOWNLOADBUTTON);
			}
			var $downloadButton = $(this._downloadButtonTemplate({
				addText: t('gallery', 'Download'),
				iconUrl: OC.imagePath('core', 'actions/download')
			}));

			$actionsContainer.prepend($downloadButton);
			$downloadButton.tooltip({'placement': 'bottom'});

			$downloadButton.click(_.bind(this._onClickDownloadSelected, this));
			//this._downloadButton = $downloadButton;
		},

		/**
		 * Event handler for when clicking on "Download" for the selected files
		 *
		 * @see core/apps/files/js/filelist.js
		 * @private
		 */
		_onClickDownloadSelected: function(event) {
			var files;
			var dir = Gallery.currentAlbum;
			if (dir === '') {
				dir = '/'
			}
			//if (this.isAllSelected() && this.getSelectedFiles().length > 1) {
			//	files = OC.basename(dir);
			//	dir = OC.dirname(dir) || '/';
			//}
			//else {
				files = _.pluck(this.getSelectedFiles(), 'path');
				files.forEach(function(file, index, files) {
					files[index] = OC.basename(file);
				});
			//}

			var downloadFileaction = $('#selectedActionsList').find('.download');

			// don't allow a second click on the download action
			if(downloadFileaction.hasClass('disabled')) {
				event.preventDefault();
				return;
			}

			var disableLoadingState = function(){
				OCA.Files.FileActions.updateFileActionSpinner(downloadFileaction, false);
			};

			OCA.Files.FileActions.updateFileActionSpinner(downloadFileaction, true);
			if(this.getSelectedFiles().length > 1) {
				OCA.Files.Files.handleDownload(this.getDownloadUrl(files, dir, true), disableLoadingState);
			}
			else {
				var first = OC.basename(this.getSelectedFiles()[0].path);
				OCA.Files.Files.handleDownload(this.getDownloadUrl(first, dir, true), disableLoadingState);
			}
			return false;
	},

		/**
		 * Returns the file info of the selected files
		 *
		 * @return array of file names
		 *
		 * @see core/apps/files/js/filelist.js
		 * @private
		 */
		getSelectedFiles: function() {
			return _.values(this._selectedFiles);
		},

		/**
		 * Returns the file data from a given file element.
		 * @param $el file tr element
		 * @return file data
		 *
		 * @see core/apps/files/js/filelist.js
		 * @private
		 */
		elementToFile: function($el){
			$el = $($el);
			var data = {
				id: parseInt($el.attr('data-id'), 10),
			};
			var path = $el.attr('data-path');
			if (path) {
				data.path = path;
			}
			return data;
		},

		/**
		 * Selected/deselects the given file element and updated
		 * the internal selection cache.
		 *
		 * @param {Object} $element single image
		 * @param {bool} state true to select, false to deselect
		 *
		 * @see core/apps/files/js/filelist.js
		 * @private
		 */
		_selectFileEl: function($element, state, showDetailsView) {
			var $checkbox = $element.find('row-element>.image-label>.selectCheckBox');
			var oldData = !!this._selectedFiles[$element.data('id')];
			var data;
			$checkbox.prop('checked', state);
			$element.toggleClass('selected', state);
			// already selected ?
			if (state === oldData) {
				return;
			}
			data = this.elementToFile($element);
			if (state) {
				this._selectedFiles[$element.data('id')] = data;
				this._selectionSummary.add(data);
			}
			else {
				delete this._selectedFiles[$element.data('id')];
				this._selectionSummary.remove(data);
			}
			//this.$el.find('.select-all').prop('checked', this._selectionSummary.getTotal() === this.files.length);
		},

		/**
		 * Event handler for when clicking on files to select them
		 */
		_onClickFile: function(event) {
			var $image = $(event.target).closest('.' + GalleryImage.cssClass);
			if (event.ctrlKey || event.shiftKey) {
				event.preventDefault();
				this._lastChecked = $image;
				var $checkbox = $image.find('.image-label>.selectCheckBox');
				this._selectFileEl($image, !$checkbox.prop('checked'));
				this.updateSelectionSummary();
			}
		},

		/**
		 * Event handler for when clicking on a element's checkbox
		 *
		 * @see core/apps/files/js/filelist.js
		 * @private
		 */
		_onClickFileCheckbox: function(event) {
			var $image = $(event.target).closest('.' + GalleryImage.cssClass);
			var state = !$image.hasClass('selected');
			this._selectFileEl($image, state);
			this._lastChecked = $image;
			this.updateSelectionSummary();
		},

		/**
		 * Returns the download URL of the given file(s)
		 * @param {string} filename string or array of file names to download
		 * @param {string} [dir] optional directory in which the file name is, defaults to the current directory
		 * @param {bool} [isDir=false] whether the given filename is a directory and might need a special URL
		 *
		 * @see core/apps/files/js/filelist.js
		 * @private
		 */
		getDownloadUrl: function(files, dir, isDir) {
			return OCA.Files.Files.getDownloadUrl(files, dir || Gallery.currentAlbum || '/', isDir);
		},

		/**
		 * Returns the ajax URL for a given action
		 * @param action action string
		 * @param params optional params map
		 *
		 * @see core/apps/files/js/filelist.js
		 * @private
		 */
		getAjaxUrl: function(action, params) {
			var q = '';
			if (params) {
				q = '?' + OC.buildQueryString(params);
			}
			return OC.filePath('files', 'ajax', action + '.php') + q;
		},

		/**
		 * Update UI based on the current selection
		 *
		 * @see core/apps/files/js/filelist.js
		 * @private
		 */
		updateSelectionSummary: function() {
			var summary = this._selectionSummary.summary;
			var selection;

			if (summary.totalFiles === 0 && summary.totalDirs === 0) {
				//this.element.find('#headerName a.name>span:first').text(t('files','Name'));
				//this.element.find('#headerSize a>span:first').text(t('files','Size'));
				//this.element.find('#modified a>span:first').text(t('files','Modified'));
				//this.element.find('table').removeClass('multiselect');
				//this.element.find('.selectedActions').addClass('hidden');
				$('#selectedActionsList').addClass('hidden'); // XXX dirty
			}
			else {
				//this.element.find('.selectedActions').removeClass('hidden');
				$('#selectedActionsList').removeClass('hidden'); // XXX Dirty
				//this.element.find('#headerSize a>span:first').text(OC.Util.humanFileSize(summary.totalSize));

				//var directoryInfo = n('files', '%n folder', '%n folders', summary.totalDirs);
				//var fileInfo = n('files', '%n file', '%n files', summary.totalFiles);

				//if (summary.totalDirs > 0 && summary.totalFiles > 0) {
				//	var selectionVars = {
				//		dirs: directoryInfo,
				//		files: fileInfo
				//	};
				//	selection = t('files', '{dirs} and {files}', selectionVars);
				//} else if (summary.totalDirs > 0) {
				//	selection = directoryInfo;
				//} else {
				//	selection = fileInfo;
				//}

				//this.element.find('#headerName a.name>span:first').text(selection);
				//this.element.find('#modified a>span:first').text('');
				//this.element.find('table').addClass('multiselect');
				//this.element.find('.delete-selected').toggleClass('hidden', !this.isSelectedDeletable());
			}
},

	};

	Gallery.View = View;
})(jQuery, _, OC, t, Gallery);
