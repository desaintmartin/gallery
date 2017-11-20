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
/* global Handlebars, oc_requesttoken, Gallery, Thumbnails */
(function ($, Gallery, oc_requesttoken) {
	"use strict";

	var TEMPLATE =
		'<a class="{{cssClass}}" style="width: {{targetWidth}}px; height: {{targetHeight}}px;" ' +
		'href="" data-path="{{path}}" data-id={{fileId}}>' +
		'	<div class="image-loader loading"></div>' +
		'	<div class="image container"></div>' +
		'	<div class="image-label">' +
		'		<input id="select-files-{{fileId}}" type="checkbox" class="selectCheckBox checkbox"/>' +
		'		<label for="select-files-{{fileId}}"></label>' +
		'		<span class="title">{{label}}</span>' +
		'	</div>' +
		'</a>';

	/**
	 * Creates a new image object to store information about a media file
	 *
	 * @param {string} src
	 * @param {string} path
	 * @param {number} fileId
	 * @param {string} mimeType
	 * @param {number} mTime modification time
	 * @param {string} etag
	 * @param {number} size
	 * @param {boolean} sharedWithUser
	 * @param {string} owner
	 * @param {number} permissions
 * @constructor
	 */
	var GalleryImage = function (src, path, fileId, mimeType, mTime, etag, size, sharedWithUser,
								 owner, permissions) {
		this.src = src;
		this.path = path;
		this.fileId = fileId;
		this.mimeType = mimeType;
		this.mTime = mTime;
		this.etag = etag;
		this.size = size;
		this.sharedWithUser = sharedWithUser;
		this.owner = owner;
		this.permissions = permissions;
		this.thumbnail = null;
		this.domDef = null;
		this.spinner = null;
	};

	GalleryImage.cssClass = 'row-element';
	GalleryImage.prototype = {
		/**
		 * Returns the Thumbnail ID
		 *
		 * @returns {[number]}
		 */
		getThumbnailIds: function () {
			return [this.fileId];
		},

		/**
		 * Returns a reference to a loading Thumbnail.image
		 *
		 * @param {boolean} square
		 *
		 * @returns {jQuery.Deferred<Thumbnail.image>}
		 */
		getThumbnail: function (square) {
			if (this.thumbnail === null) {
				this.thumbnail = Thumbnails.get(this.fileId, square);
			}
			return this.thumbnail.loadingDeferred;
		},

		/**
		 * Returns the width of a thumbnail
		 *
		 * Used to calculate the width of the row as we add more images to it
		 *
		 * @returns {number}
		 */
		getThumbnailWidth: function (targetHeight) {
			var image = this;
			// img is a Thumbnail.image
			return this.getThumbnail(false).then(function (img) {
				var width = 0;
				if (img) {
					// In Firefox, you don't get the size of a SVG before it's added to the DOM
					image.domDef.children('.image').append(img);
					if (image.mimeType === 'image/svg+xml') {
						image.thumbnail.ratio = img.width / img.height;
					}
					width = Math.round(targetHeight * image.thumbnail.ratio);
				}

				return width;
			});
		},

		/**
		 * Creates the container, the a and img elements in the DOM
		 *
		 * Each image is also a link to start the full screen slideshow
		 *
		 * @param {number} targetHeight
		 *
		 * @return {a}
		 */
		getDom: function (targetHeight) {
			if (this.domDef === null) {
				var template = Handlebars.compile(TEMPLATE);
				var imageElement = template({
					cssClass: GalleryImage.cssClass,
					fileId: this.fileId,
					targetHeight: targetHeight,
					targetWidth: targetHeight,
					label: OC.basename(this.path),
					path: this.path
				});
				this.domDef = $(imageElement);
				this._addLabel();
				this.spinner = this.domDef.children('.image-loader');
			}
			this._resetSelectionUI();
			return this.domDef;
		},

		/**
		 * Resizes the image once it has been loaded
		 *
		 * @param {Number} targetHeight
		 * @param {Number} newWidth
		 */
		resize: function (targetHeight, newWidth) {
			if (this.spinner !== null) {
				var img = this.thumbnail.image;
				this.spinner.remove();
				this.spinner = null;
				this.domDef.attr('data-width', newWidth)
					.attr('data-height', targetHeight);

				var url = this._getLink();
				this.domDef.attr('href', url);

				// This will stretch wide images to make them reach targetHeight
				$(img).css({
					'width': newWidth,
					'height': targetHeight
				});
				img.alt = encodeURI(this.path);

				this.domDef.click(this._openImage.bind(this));
			}
		},

		/**
		 * Adds a label to the album
		 *
		 * @private
		 */
		_addLabel: function () {
			var imageLabel = this.domDef.children('.image-label');
			var toggleLabel = function() {
				if ($(this).hasClass('selected')) {
					imageLabel.show();
					return;
				}
				imageLabel.slideToggle(OC.menuSpeed);
			};
			this.domDef.hover(toggleLabel, toggleLabel);
		},

		/**
		 * Resets selection UI
		 * Make sure checkbox is not checked, in case of user navigating between
		 * albums back and forth, thus reusing domDef in its last state
		 *
		 * @private
		 */
		_resetSelectionUI: function() {
			if (this.domDef.hasClass('selected')) {
				this.domDef.removeClass('selected');
				var selectCheckbox = this.domDef.find('.selectCheckBox').get(0);
				if (selectCheckbox && selectCheckbox.checked) {
					selectCheckbox.checked = false;
				  this.domDef.children('.image-label').hide();
				}
			}
		},

		/**
		 * Generates the link for the click action of the image
		 *
		 * @returns {string}
		 * @private
		 */
		_getLink: function () {
			var url = '#' + encodeURIComponent(this.path);
			if (!this.thumbnail.valid) {
				var params = {
					c: this.etag,
					requesttoken: oc_requesttoken
				};
				url = Gallery.utility.buildGalleryUrl(
					'files',
					'/download/' + this.fileId,
					params
				);
			}

			return url;
		},

		/**
		 * Call when the image is clicked on.
		 *
		 * @param event
		 * @private
		 */
		_openImage: function (event) {
			// click function for future use.
		}
	};

	window.GalleryImage = GalleryImage;
})(jQuery, Gallery, oc_requesttoken);
