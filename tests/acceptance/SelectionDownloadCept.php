<?php
/**
 * Nextcloud - Gallery
 *
 *
 * This file is licensed under the Affero General Public License version 3 or
 * later. See the COPYING file.
 *
 * @author Cedric de Saint Martin <cedric@desaintmartin.fr>
 *
 * @copyright Olivier Paroz 2017
 */

use \Page\Acceptance\Login;
use \Page\Gallery as GalleryPage;

$I = new AcceptanceTester($scenario);
$I->am('a standard user');
$I->wantTo('Download a selection of photos');

$credentials = $I->getUserCredentials();
$loginPage = new Login($I);
$loginPage->login($credentials[0], $credentials[1]);
$loginPage->confirmLogin();

$I->amOnPage('/index.php/apps/gallery/#folder1');
$I->waitForElement(['css' => 'a[href="#folder1%2Ftestimage.jpg"]']);
$I->waitForElementNotVisible('.icon-loading');

$albumName = 'folder1';
$file1Order = 2;
$file1RowElement = '.row-element:nth-of-type(' . $file1Order . ')';
$file1Label = $file1RowElement . '>.image-label>label';
$file1Name = $I->executeJs('return $("' . $file1RowElement . '>.image-label>span").html();');
$file2Order = 3;
$file2RowElement = '.row-element:nth-of-type(' . $file2Order . ')';
$file2Label = $file2RowElement . '>.image-label>label';
$file2Name = $I->executeJs('return $("' . $file2RowElement . '>.image-label>span").html();');

$I->dontSeeElement('.icon-download');

// Select one file, download it
$I->dontSeeElement($file1Label);
$I->moveMouseOver(null, 300, 200); // Known problems with WebDriver's moveMouseOver with css
$I->waitForElementVisible($file1Label);
$I->click($file1Label);
$I->waitForElementVisible('.icon-download');
$I->click('.icon-download');
$I->waitForElementNotVisible('.icon-loading-small');
$I->checkSelectionDownloadUrlMatches($albumName, [$file1Name]);

// Move mouse somewhere else, still see the label
$I->moveMouseOver(null, -300, -200);
$I->seeElement($file1Label);

// Select two files, download them
// Note: first file is already selected
$I->dontSeeElement($file2Label);
$I->moveMouseOver(null, 800, 200);
$I->waitForElementVisible($file2Label);
$I->click($file2Label);
$I->waitForElementVisible('.icon-download');
$I->click('.icon-download');
$I->waitForElementNotVisible('.icon-loading-small');
$I->checkSelectionDownloadUrlMatches($albumName, [$file2Name, $file1Name]);

// Unselect one, download the other
$I->moveMouseOver(null, -500, 0);
$I->click($file1Label);
$I->moveMouseOver(null, -300, -200); // Absolute : (0, 0)
$I->waitForElementNotVisible($file1Label);
$I->click('.icon-download');
$I->waitForElementNotVisible('.icon-loading-small');
$I->checkSelectionDownloadUrlMatches($albumName, [$file2Name]);

// Change album, select one, download
$I->click('.row-element:nth-of-type(1)>span');
$I->waitForElementNotVisible($file2RowElement);
$I->waitForElementNotVisible('.loading');
$I->seeElement(['xpath' => '//span[text()="shared1"]']); // See shared1 in breadcrumb

$sharedAlbumName = 'folder1/shared1';
$sharedFile1Order = 2;
$sharedFile1RowElement = '.row-element:nth-of-type(' . $sharedFile1Order . ')';
$sharedFile1Label = $sharedFile1RowElement . '>.image-label>label';
$sharedFile1Name = $I->executeJs('return $("' . $sharedFile1RowElement . '>.image-label>span").html();');

$I->dontSeeElement($sharedFile1Label);
$I->moveMouseOver(null, 300, 200);
$I->waitForElementVisible($sharedFile1Label);
$I->click($sharedFile1Label);
$I->waitForElementVisible('.icon-download');
$I->click('.icon-download');
$I->waitForElementNotVisible('.icon-loading-small');
$I->checkSelectionDownloadUrlMatches($sharedAlbumName, [$sharedFile1Name]);

// Come back in original album through breadcrumb, select one, download
$I->moveMouseOver(null, -300, -200);
$I->click(['link' => $albumName]);
$I->waitForElementNotVisible('.loading');
$I->wait(1); // Just wait a bit so that everything is initialized
$I->moveMouseOver(null, 300, 200);
$I->waitForElementVisible($file1Label);
$I->click($file1Label);
$I->waitForElementVisible('.icon-download');
$I->click('.icon-download');
$I->waitForElementNotVisible('.icon-loading-small');
$I->checkSelectionDownloadUrlMatches($albumName, [$file1Name]);

// Unselect all, assert download button has disappeared
$I->click($file1Label);
$I->waitForElementNotVisible('.icon-download');

$I->moveMouseOver(null, -300, -200); // Move back to (0,0)

