// ==UserScript==
// @name         Wanikani Leaderboard 2
// @namespace    http://tampermonkey.net/
// @version      2.0.2
// @description  Get levels from usernames and order them in a competitive list
// @author       faraplay, Dani2
// @match        https://www.wanikani.com/dashboard
// @match        https://www.wanikani.com/
// @require      https://unpkg.com/sweetalert/dist/sweetalert.min.js
// @grant        none
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/488876/Wanikani%20Leaderboard%202.user.js
// @updateURL https://update.greasyfork.org/scripts/488876/Wanikani%20Leaderboard%202.meta.js
// ==/UserScript==

(function() {
    'use strict';

    //------------------------------
    // Wanikani Framework
    //------------------------------
    if (!window.wkof) {
        let response = confirm('WaniKani Leaderboard script requires WaniKani Open Framework.\n Click "OK" to be forwarded to installation instructions.');

        if (response) {
            window.location.href = 'https://community.wanikani.com/t/instructions-installing-wanikani-open-framework/28549';
        }

        return;
    }

    const config = {

    };

    wkof.include('Menu, Settings');
    wkof.ready('Menu, Settings').then(install_menu).then(install_settings);

    //------------------------------
    // Menu
    //------------------------------
    var settings_dialog;
    var defaults = {
        userOrderOption: 'key1',
        numberOfLeaderboardTabless: '1'
    };

    function install_menu() {
        wkof.Menu.insert_script_link({
            script_id: 'Leaderboard',
            name: 'Leaderboard',
            submenu:   'Settings',
            title:     'Leaderboard',
            on_click:  open_settings
        });
    }

    function open_settings() {
        settings_dialog.open();
    }
    function install_settings() {
        settings_dialog = new wkof.Settings({
            script_id: 'Leaderboard',
            name: 'Leaderboard',
            title: 'Leaderboard',
            on_save: process_settings,
            settings: {
                tabset_id: {
                    type: 'tabset',
                    content: {
                        page_id1: {type: 'page', label:  'Add user', hover_tip:'', content: {
                            addUser: {type:'input', label:'Add a user', hover_tip: 'Add a user to leaderboard', placeholder: 'username', validate: ''}
                        }},
                        page_id2: {type: 'page', label:  'Sort Order', hover_tip:'', content: {
                            'userOrderOption': {type: 'dropdown', label: 'Sorting order', hover_tip: 'Select how you want users to be ordered.', default:'keyDefault', full_width: true, on_change: changeSortOrder,
                                            content: {
                                                keyDefault: '--Sort Order--',
                                                key1: 'Level -> Burn% -> Name',
                                                key2: 'Level -> Name',
                                                key3: 'Burn% -> Level -> Name',
                                                key4: 'Burn% -> Name',
                                                key5: 'Name Ascending',
                                                key6: 'Name Descending',
                                            }
                                            }
                        }},
                        page_id3: {type: 'page', label:  'Number of tables', hover_tip:'', content: {
                            'numberOfLeaderboardTabless': {type:'dropdown', label:'Number of leaderboard tables', hover_tip: 'The amount of tables the added users will be split between', default:'0', full_width: true,
                                            on_change: changeNumberofTables,
                                            content:{0:'--table nr.--', 1:'1 (Min)', 2:'2',3:'3'}},
                        }}
                    }
                }
            }
        });
        settings_dialog.load().then(function(){
            settings_dialog.save();
        });
    }
    function process_settings(){
        settings_dialog.save();
        addUser(wkof.settings.Leaderboard.addUser);
    }

    //manually delete cache
    function emptyList(){
        deleteLeaderboardRelatedCache().then(function() {
            usersInfoList = [];
            processArray();
        });
    }

    //------------------------------
    // Time
    //------------------------------

    var timeSinceLastRefresh = 1539614371504;
    var timeSinceLastRefreshText = '';

    function updateTimeSinceRefreshText (){
        let times = millisecondsToDayHourMinute(Date.now()-timeSinceLastRefresh);
        let daysPassed = times[0] === 1 ? ' day ' : ' days ';
        let hoursPassed = times[1] === 1 ? ' hour ' : ' hours ';
        let minutesPassed = times[2] === 1 ? ' minute ' : ' minutes ';
        timeSinceLastRefreshText = times[0] + daysPassed + times[1] + hoursPassed + times[2] + minutesPassed;
    }

    function millisecondsToDayHourMinute(time){
        let daysPassed = 24 * 60 * 60 * 1000,
            hoursPassed = 60 * 60 * 1000,
            day = Math.floor(time / daysPassed),
            hour = Math.floor( (time - day * daysPassed) / hoursPassed),
            minute = Math.round( (time - day * daysPassed - hour * hoursPassed) / 60000),
            pad = function(n){ return n < 10 && n != 0 ? '0' + n : n; };
        if( minute === 60 ){
            hour++;
            minute = 0;
        }
        if( hour === 24 ){
            day++;
            hour = 0;
        }
        return [day, pad(hour), pad(minute)];
    }

    //------------------------------
    // Caching
    //------------------------------

    //userlist
    var usersInfoList = [];
    var userSortingMethod = 'key1';
    var numberOfLeaderboardTables = '1';

    function saveUserListToCache(userList){
        wkof.file_cache.save('leaderboard_userList', userList).then(function(){
            //console.log('Save complete!');
        });
    }

    function getUserListFromCache(){
        let deferred = $.Deferred();
        wkof.file_cache.load('leaderboard_userList')
            .then(function(settings) {
            deferred.resolve(settings);
        }).catch(e => {
            console.log('Leaderboard - No cache found');
            deferred.resolve();
        });
        return deferred.promise();
    }

    //not called anywhere is for debugging purposes
    function deleteLeaderboardRelatedCache(cacheName = null){
        let deferred = $.Deferred();
        if(cacheName){
            console.log('deleting: ' + cacheName);
            wkof.file_cache.delete(cacheName).then(function() {//delete specific cached file
                deferred.resolve();
            });
        } else {
            console.log('deleting leaderboard related caches');
            wkof.file_cache.delete(/^leaderboard_/).then(function() {//delete all leaderboard related caching
                deferred.resolve();
            });
        }
        return deferred.promise();
    }

    //refresh time
    function getTimeSinceLastRefreshFromCache(){
        let deferred = $.Deferred();
        wkof.file_cache.load('leaderboard_timeSinceLastRefresh').then(function(settings) {
            deferred.resolve(settings);
        }).catch(e => {
            wkof.file_cache.save('leaderboard_timeSinceLastRefresh', Date.now()).then(function(){
            }).catch(e => {
                console.log(e);
            });
            timeSinceLastRefreshText = '0 days 0 hours 0 minutes';
            deferred.resolve(Date.now());
        });
        return deferred.promise();
    }

    function refreshDashboard(){
        wkof.file_cache.save('leaderboard_timeSinceLastRefresh', Date.now()).then(function(){
        }).catch(e => {
            console.log(e);
        });

        timeSinceLastRefreshText = '0 days 0 hours 0 minutes';
        processArray();
    }

    function saveSortingMethod(){
        wkof.file_cache.save('leaderboard_sortingMethod', userSortingMethod).then(function(){
            //console.log('Save complete! method:' + userSortingMethod);
        });
    }

    function getUserSortingMethodFromCache(){
        let deferred = $.Deferred();
        wkof.file_cache.load('leaderboard_sortingMethod').then(function(settings) {
            deferred.resolve(settings);
        }).catch(e => {
            userSortingMethod = 'key1';
            deferred.resolve();
        });
        return deferred.promise();
    }

    function saveNumberOfLeaderboardTables(){
        wkof.file_cache.save('leaderboard_numberOfTables', numberOfLeaderboardTables).then(function(){
            //console.log('Save complete! nr of tables:' + numberOfLeaderboardTables);
        });
    }

    function getNumberOfLeaderboardTablesFromCache(){
        let deferred = $.Deferred();
        wkof.file_cache.load('leaderboard_numberOfTables').then(function(settings) {
            deferred.resolve(settings);
        }).catch(e => {
            numberOfLeaderboardTables = '1';
            deferred.resolve();
        });
        return deferred.promise();
    }

    //------------------------------
    // Global variables
    //------------------------------
    const wkRealms = ['快', '苦', '死', '地獄', '天堂', '現実', '!!'];
    const wkRealmNames = ['Pleasant', 'Painful', 'Death', 'Hell', 'Paradise', 'Reality', 'Error'];
    const leaderboardColors = ['none', 'apprColor', 'guruColor', 'masterColor', 'enlightenedColor', 'burnedColor', 'errorColor'];

    //admin accounts, admin is any account with the Leader badge or a unique flair on the forums (list may be incomplete; users with no wk account like 'WaniMeKani' or 'system' are omitted)
    const adminNamesInfinity = ['viet', 'viet', 'Kristen', 'kristen', 'koichi', 'sam', 'oldbonsai', 'arpit.jalan', 'arpit', 'jenk', 'WaniKaniJavi', 'wanikanijavi', 'gomakuma'];//∞
    const adminNamesStar = ['TofuguKanae', 'tofugukanae', 'CyrusS', 'cyruss', 'mamimumason', 'a-regular-durtle', 'koichi-descended', 'RachelG', 'rachelg', 'arlo', 'camfugu', 'TofuguJenny', 'tofugujenny'];//★
    const adminNamesNone = ['dax', 'HAWK', 'hawk', 'blake.erickson', 'blake', 'CidPollendina', 'cidpollendina', 'Aya', 'aya', 'mamimumason'];//none

    const adminIdentifier = 'adminUserLeaderboard';
    const accountNotFoundMessage = ' (not found!)';

    //total number of WaniKani items
    const totalNumberOfWKItems = 8910;

    var toggleLeaderboardWidth0 = 0;
    var toggleLeaderboardWidth1 = 0;
    var toggleLeaderboardWidth2 = 0;
    var usersThatLeveledUp = '';

    //------------------------------
    // Get user information (name, level, avatar, realm)
    //------------------------------

    //determine what realm (pleasant, painful, etc.) a user is in
    function setRealm(userLevel){
        switch(Math.ceil(userLevel / 10) * 10) {
            case 70:
                return 5;//reality+
            case 60:
                return 5;//reality
            case 50:
                return 4;//heaven
            case 40:
                return 3;//hell
            case 30:
                return 2;//death
            case 20:
                return 1;//painful
            case 10:
                return 0;//pleasant
            default:
                return 6;//error
        }
    }

    async function checkIfUserAlreadyOnLeaderboard(name = ''){
        await delay();
        for (var i = 0; i < usersInfoList.length; i++){
            if(usersInfoList[i].name.toLowerCase() === name.toLowerCase() || usersInfoList[i].name.toLowerCase() === name+accountNotFoundMessage.toLowerCase()){
                return false;
                break;
            }
        }
        return true;
    }

    //add a single user
    async function addUser(name=''){
        let addUser = true;
        name = name.toLowerCase().split(' ').join('');
        checkIfUserAlreadyOnLeaderboard(name).then(
            async function(result){
                if(result){
                    //create default user info
                    const obj = {};
                    obj['name'] = name;
                    obj['level'] = 0;
                    obj['avatar_link'] = 'https://www.gravatar.com/avatar/65977e18f599e0319495b468c92b5179?s=300&d=https://cdn.wanikani.com/default-avatar-300x300-20121121.png';
                    obj['realm_number'] = 6;
                    obj['srs_distribution'] = [{}];
                    obj['wasUserFound'] = false;
                    obj['totalBurnPercentage'] = 0;

                    let object = [obj];
                    const promise = object.map(assignLevelAndAvatarFromWkProfile);//process a single user
                    await Promise.all(promise);

                    usersInfoList.push(object[0]);//add single user to the rest of the users

                    inference();
                } else{
                    if(typeof swal === "function"){
                        swal('A user with that name already exists in the list.');
                    } else{
                        alert('A user with that name already exists in the list.');
                    }
                }
        });
    }

    //delete a single user
    function deleteUser(name = ''){
        name = name.currentTarget.className.split(" ")[0];//get username from classnames
        for(var i = usersInfoList.length - 1; i >= 0; i--) {
            if(usersInfoList[i].name.split(accountNotFoundMessage).join('') === name) {
                usersInfoList.splice(i, 1);
            }
        }
        saveUserListToCache(usersInfoList);

        //if list empty reset refresh time to zero
        if(usersInfoList.length === 0){
            deleteLeaderboardRelatedCache();
            refreshDashboard();
        };

        createLeaderboard();
    }

    function changeSortOrder(){
        if(wkof.settings.Leaderboard.userOrderOption !== 'keyDefault'){
            userSortingMethod = wkof.settings.Leaderboard.userOrderOption;//save user chosen sorting method
        }
        saveSortingMethod();
        inference();
        settings_dialog.close();
    }

    function changeNumberofTables(){
        if(wkof.settings.Leaderboard.numberOfLeaderboardTabless !== '0'){
            numberOfLeaderboardTables = wkof.settings.Leaderboard.numberOfLeaderboardTabless;//save user chosen number of tables
        }
        saveNumberOfLeaderboardTables();
        createLeaderboard();
        settings_dialog.close();
    }

    //for sorting and saving userlist to cache
    function inference(){
        //determine sorting order for users
        switch(userSortingMethod) {
            case 'key1'://lv->burn->name
                usersInfoList.sort(function(a, b){
                    if(a.level !== b.level) {
                        return b.level - a.level;
                    }else if(a.totalBurnPercentage !== b.totalBurnPercentage) {
                        return b.totalBurnPercentage - a.totalBurnPercentage;
                    }else {
                        return a.name.localeCompare(b.name, 'en');
                    }
                });
                break;
            case 'key2'://lv->name
                usersInfoList.sort(function(a, b){
                    if(a.level !== b.level) {
                        return b.level - a.level;
                    }else {
                        return a.name.localeCompare(b.name, 'en');
                    }
                });
                break;
            case 'key3'://burn->lv->name
                usersInfoList.sort(function(a, b){
                    if(a.totalBurnPercentage !== b.totalBurnPercentage) {
                        return b.totalBurnPercentage - a.totalBurnPercentage;
                    }else if(a.level !== b.level) {
                        return b.level - a.level;
                    }else {
                        return a.name.localeCompare(b.name, 'en');
                    }
                });
                break;
            case 'key4'://burn->name
                usersInfoList.sort(function(a, b){
                    if(a.totalBurnPercentage !== b.totalBurnPercentage) {
                        return b.totalBurnPercentage - a.totalBurnPercentage;
                    }else {
                        return a.name.localeCompare(b.name, 'en');
                    }
                });
                break;
            case 'key5'://name ascending
                usersInfoList.sort(function(a, b){ return a.name.localeCompare(b.name, 'en');});
                break;
            case 'key6'://name descending
                usersInfoList.sort(function(a, b){ return b.name.localeCompare(a.name, 'en');});
                break;
        }

        saveUserListToCache(usersInfoList);//save sorting result and any added users

        createLeaderboard();//renew html
    }

    //throttle the requests a little
    function delay(){
        return new Promise(resolve => setTimeout(resolve, 250));
    }

    //get level, avatar, name and SRS stats from wk profile
    async function assignLevelAndAvatarFromWkProfile(item)
    {
        await delay();

        let xmlhttp;
        let userName = '';
        let userLevel = 0;
        let userGravatarLink = '';
        let srsCountsLabeled = [];
        let hasUserLeveledUp = false;
        let userFound = false;

        if (window.XMLHttpRequest)
        {// code for IE7+, Firefox, Chrome, Opera, Safari
            xmlhttp=new XMLHttpRequest();

            xmlhttp.onreadystatechange= function()
            {
                if (xmlhttp.readyState==4 && xmlhttp.status==200)
                {
                    //we get user information from the profile page e.g. wanikani.com/users/koichi
                    const userNameMatch = xmlhttp.responseText.match(/<div class="public-profile__username">([^<>]*)<\/div>/);
                    const userLevelMatch = xmlhttp.responseText.match(/<div class="public-profile__level-info-level">Level ([^<>]*)<\/div>/);
                    const userGravatarMatch = xmlhttp.responseText.match(/<div class="public-profile__avatar" .* style="background-image: url\(https:\/\/www\.gravatar\.com\/avatar\/(.*)\?.*\);"><\/div>/);

                    if (userNameMatch && userLevelMatch && userGravatarMatch &&
                        //check to see if user given name and web retrieved user name are equal
                        userNameMatch[1].toLowerCase() === item.name.toLowerCase()){
                        userName = userNameMatch[1];
                        userLevel = userLevelMatch[1];

                        //check to see if user is already on the leaderboards
                        let found = usersInfoList.find(function(element) {
                            return element.name === userName.toLowerCase();
                        });
                        if(found !== undefined){
                            //check to see if user has leveled up, so we can display that later
                            if(found.level < userLevel && found.level != 0){
                                usersThatLeveledUp += found.name + ' ' + found.level + ' -> ' + userLevel + ', \n';
                                hasUserLeveledUp = true;
                            }
                        }

                        //get gravatar link
                        userGravatarLink = userGravatarMatch[1];

                        userFound = true;
                    } else { //a wanikani profile page didn't exist for this username and we got redirected to dashboard

                        //check to see if username is already on the leaderboards
                        /*let found = usersInfoList.find(function(element) {
                            return element.name === item.name;
                        });
                        //Account may have had a username change or been deleted
                        if(found !== undefined && item.wasUserFound){
                            alert(item.name + ' this username cannot be found. the account may have had a name change, been deleted or an error may have occured.');
                        }*/

                        userLevel = -1;
                        userGravatarLink = 'https://www.gravatar.com/avatar/65977e18f599e0319495b468c92b5179?s=300&d=https://cdn.wanikani.com/default-avatar-300x300-20121121.png';//default avatar
                        userFound = false;
                    }

                    //get SRS scores

                    const regexTemplate = `title="<div class='srs-logo STAGE'></div>" data-content="&lt;ul&gt;&lt;li&gt;Radicals&lt;span&gt;([0-9]+)&lt;/span&gt;&lt;/li&gt;&lt;li&gt;Kanji&lt;span&gt;([0-9]+)&lt;/span&gt;&lt;/li&gt;&lt;li&gt;Vocabulary&lt;span&gt;([0-9]+)&lt;/span&gt;&lt;/li&gt;&lt;/ul&gt;"`;
                    const stages = ["apprentice", "guru", "master", "enlightened", "burned"];

                    const obj = {};
                    for (const stage of stages) {
                        const stageRegex = new RegExp(regexTemplate.replace("STAGE", stage));
                        const stageMatch = xmlhttp.responseText.match(stageRegex);
                        if (stageMatch) {
                            obj[stage + "Radicals"] = Number(stageMatch[1]);
                            obj[stage + "Kanji"] = Number(stageMatch[2]);
                            obj[stage + "Vocabulary"] = Number(stageMatch[3]);
                            obj[stage + "Total"] = Number(stageMatch[1]) + Number(stageMatch[2]) + Number(stageMatch[3]);
                        }
                    }
                    srsCountsLabeled.push(obj);
                }
            }
            xmlhttp.open("GET", '/users/' + item.name, false);
            xmlhttp.send();
        }

        item.level = userLevel;//assign level
        item.avatar_link = userGravatarLink;//assign gravatarlink
        item.realm_number = setRealm(item.level);//assign realm
        item.srs_distribution = srsCountsLabeled;//assign SRS stats
        item.hasLeveledUp = hasUserLeveledUp;//whether or not user leveled up since last refresh
        item.wasUserFound = userFound;//whether the user name yielded result in the past (is used to detect name changes or deletion of account)
        item.totalBurnPercentage = Math.round((srsCountsLabeled[0].burnedTotal/totalNumberOfWKItems*100) * 100) / 100;
    }

    function showLevelUps(){
        if(usersThatLeveledUp != ''){
            usersThatLeveledUp = usersThatLeveledUp.substring(0,usersThatLeveledUp.length-3);//remove the ', '

            if(typeof swal === "function"){
                swal('The following user(s) leveled up: \n', usersThatLeveledUp);
            } else{
                alert('The following user(s) leveled up: \n' + usersThatLeveledUp);
            }
            usersThatLeveledUp = '';
        }
    }

    async function processArray() {
        $('.leaderboard_loader').css('display', 'inline');
        $('.leaderboardSpan').addClass('blurry-text');

        //process array in parallel
        const promises = usersInfoList.map(assignLevelAndAvatarFromWkProfile);//refresh all
        await Promise.all(promises);

        showLevelUps();
        inference();
    }

    //not called anywhere is for debugging purposes
    /*async function testData(){
        const obj = {};
        obj['name'] = 'testing';
        obj['level'] = 1;
        obj['avatar_link'] = 'https://www.gravatar.com/avatar/65977e18f599e0319495b468c92b5179?s=300&d=https://cdn.wanikani.com/default-avatar-300x300-20121121.png';
        obj['realm_number'] = 1;
        obj['srs_distribution'] = [{}];
        obj['hasLeveledUp'] = false;

        let object = [obj];

        usersInfoList.push(object[0]);//add single user to the rest of the users

        inference();
    }*/

    function startup() {
        //for testing purposes
        //deleteLeaderboardRelatedCache();
        //testData();

        //get cache
        getTimeSinceLastRefreshFromCache().then(function(result) {
            timeSinceLastRefresh = result;
            updateTimeSinceRefreshText();
            if (Date.now() > timeSinceLastRefresh + (1000 * 60 * 60 * 24)){
                console.log("It's been over a day, refresh!");
                delay().then(refreshDashboard);
            }
        });

        //get cache
        getUserSortingMethodFromCache().then(function(result) {
            userSortingMethod = result;
            if (userSortingMethod == null){
                userSortingMethod = 'key1';
            }
        });

        //get cache
        getNumberOfLeaderboardTablesFromCache().then(function(result) {
            numberOfLeaderboardTables = result;
            if (numberOfLeaderboardTables == null){
                numberOfLeaderboardTables = '1';
            }
        });

        //get cache
        getUserListFromCache().then(function(result) {
            if(result !== [] && result != undefined){
                usersInfoList = result;
                createLeaderboard();
            } else { //rebuilt anew
                //usersInfoList = usersInfoListTestData; //testing
                processArray();
            }
        });
    }

    //------------------------------
    // Styling
    //------------------------------

    const leaderboardTableCss = `
        /*.none*/

        #leaderboard > .span4 .kotoba-table-list table .none a, #leaderboard > .span4 .kotoba-table-list table .none {
            color: black;
        }
        #leaderboard > .span4 .kotoba-table-list table tr td span {
            padding: 0em 0.3em;
        }

        /*COLORS*/

        .apprColor {
            background-color: #f100a1;
            background-image: -moz-linear-gradient(top, #f0a, #dd0093);
            background-image: -webkit-gradient(linear, 0 0, 0 100%, from(#f0a), to(#dd0093));
            background-image: -webkit-linear-gradient(top, #f0a, #dd0093);
            background-image: -o-linear-gradient(top, #f0a, #dd0093);
            background-image: linear-gradient(to bottom, #f0a, #dd0093);
            background-repeat: repeat-x;
        }
        .guruColor {
            background-color: #a100f1;
            background-image: -moz-linear-gradient(top, #a0f, #9300dd);
            background-image: -webkit-gradient(linear, 0 0, 0 100%, from(#a0f), to(#9300dd));
            background-image: -webkit-linear-gradient(top, #a0f, #9300dd);
            background-image: -o-linear-gradient(top, #a0f, #9300dd);
            background-image: linear-gradient(to bottom, #a0f, #9300dd);
            background-repeat: repeat-x;
        }
        .masterColor {
            background-color: #294ddb;/*183FD8*/
            background-image: -moz-linear-gradient(top, #5571e2, #2545C3);
            background-image: -webkit-gradient(linear, 0 0, 0 100%, from(#5571e2), to(#2545C3));
            background-image: -webkit-linear-gradient(top, #5571e2, #2545C3);
            background-image: -o-linear-gradient(top, #5571e2, #2545C3);
            background-image: linear-gradient(to bottom, #5571e2, #2545C3);
            background-repeat: repeat-x;
        }
        .enlightenedColor {
            background-color: #00a1f1;
            background-image: -moz-linear-gradient(top, #0af, #0093dd);
            background-image: -webkit-gradient(linear, 0 0, 0 100%, from(#0af), to(#0093dd));
            background-image: -webkit-linear-gradient(top, #0af, #0093dd);
            background-image: -o-linear-gradient(top, #0af, #0093dd);
            background-image: linear-gradient(to bottom, #0af, #0093dd);
            background-repeat: repeat-x;
        }
        .burnedColor {
            background-color: #faac05;
            background-image: -moz-linear-gradient(top, #fbc550, #faac05);
            background-image: -webkit-gradient(linear, 0 0, 0 100%, from(#fbc550), to(#faac05));
            background-image: -webkit-linear-gradient(top, #fbc550, #faac05);
            background-image: -o-linear-gradient(top, #fbc550, #faac05);
            background-image: linear-gradient(to bottom, #fbc550, #faac05);
            background-repeat: repeat-x;
        }
        .customColor1 {
            background-color: #dd0093;
        }
        .errorColor{
            background-color: maroon;
        }

        /*END COLORS*/

        /*used to move level*/
        .floatRight {
            float: right;
        }

        /*TOOLTIP*/
        [tooltip]:before {
            /* needed - do not touch */
            content: attr(tooltip);
            position: absolute;
            opacity: 0;
            z-index: 1;

            /* customizable */
            transition: all 0.15s ease;
            padding: 10px;
            color: #333;
            border-radius: 10px;
            box-shadow: 2px 2px 1px silver;
        }

        /*TOOLTIP*/

        [tooltip]:hover:before {
            /* needed - do not touch */
            opacity: 1;

            /* customizable */
            background: yellow;
            margin-top: -50px;
            margin-left: 20px;
        }

        [tooltip]:not([tooltip-persistent]):before {
            pointer-events: none;
        }

        a.tooltipImg strong {line-height:30px;}
        a.tooltipImg span {
            z-index:10;display:none; padding:7px 10px;
            margin-top:30px; margin-left:-160px;
            width:300px; line-height:16px;
        }
        a.tooltipImg:hover span{
            display:inline; position:absolute;
            border:2px solid #FFF;  color:#EEE;
            background:#333 url(https://cdn.wanikani.com/default-avatar-300x300-20121121.png) repeat-x 0 0;
        }

        .callout {z-index:20;position:absolute;border:0;top:-14px;left:120px;}

        a.tooltipImg span
        {
            border-radius:2px;
            box-shadow: 0px 0px 8px 4px #666;
            /*opacity: 0.8;*/
        }
        a.tooltipImg:before {
            pointer-events: none;
        }

        /*END TOOLTIP*/
        /*LEADERBOARD*/

        td.leaderboard-userImg > img {
            border-radius: 50%;
            width: 25px;
            height: 25px;
            max-height: 25px;
        }
        #leaderboard_loader {
            border: 16px solid #f3f3f3;
            border-radius: 50%;
            border-top: 16px solid #3498db;
            width: 30px;
            height: 30px;
            -webkit-animation: spin 2s linear infinite; /* Safari */
            animation: spin 2s linear infinite;
            position: absolute;
            top: 40%;
            left: 40%;
            display:none;
        }
        /* Safari */
        @-webkit-keyframes spin {
            0% { -webkit-transform: rotate(0deg); }
            100% { -webkit-transform: rotate(360deg); }
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .textshadow .blurry-text {
            color: transparent;
            text-shadow: 0 0 5px rgba(0,0,0,0.5);
        }
        .blurry-text, .blurry-text section .small-caps, .blurry-text section table tbody tr, .blurry-text section table tbody tr td a span {
            color: transparent;
            text-shadow: 0 0 5px rgba(0,0,0,0.5);
        }
        #leaderboard-files-import {
            width: 0.1px;
            height: 0.1px;
            opacity: 0;
            overflow: hidden;
            position: absolute;
            z-index: -1;
        }
        .leaderboard-img-center {
            display: block;
            margin-left: auto;
            margin-right: auto;
        }
        /*END LEADERBOARD*/
        `;

    var leaderboardStyling = document.createElement('style');
    leaderboardStyling.type='text/css';
    if(leaderboardStyling.styleSheet){
        leaderboardStyling.styleSheet.cssText = leaderboardTableCss;
    }else{
        leaderboardStyling.appendChild(document.createTextNode(leaderboardTableCss));
    }
    document.getElementsByTagName('head')[0].appendChild(leaderboardStyling);

    //------------------------------
    // Leaderboard
    //------------------------------

    function processImportedUsers(file) {
        let reader = new FileReader();
        reader.readAsText(file);
        reader.onload = function(event){
            let csv = event.target.result;
            csv = csv.replace(/[^ -~]+/g,' ');//remove non printable characters
            csv = csv.split(',').join(' ');//in case multiple spreadsheet columns are used
            csv += ' ';

            let temp = '';
            let preExistingUsers = '';
            for (let i = 0; i < csv.length; i++){
                if (csv[i] !== ' ' || csv[i].length === 0) {
                    temp += csv[i];
                } else if (temp !== '') {
                    temp = temp.toLowerCase();

                    //check to see if user is already on the leaderboards
                    let isInList = false;
                    for (let j = 0; j < usersInfoList.length; j++){
                        if(usersInfoList[j].name.toLowerCase() === temp || usersInfoList[j].name.toLowerCase() === temp+accountNotFoundMessage.toLowerCase()){
                            isInList = true;
                            break;
                        }
                    }
                    if(!isInList){
                        //create default user info
                        const obj = {};
                        obj['name'] = temp;
                        obj['level'] = 0;
                        obj['avatar_link'] = 'https://www.gravatar.com/avatar/65977e18f599e0319495b468c92b5179?s=300&d=https://cdn.wanikani.com/default-avatar-300x300-20121121.png';
                        obj['realm_number'] = 6;
                        obj['srs_distribution'] = [{}];
                        obj['hasLeveledUp'] = false;
                        obj['wasUserFound'] = false;
                        obj['totalBurnPercentage'] = 0;

                        let object = [obj];
                        usersInfoList.push(object[0]);//add single user to the rest of the users
                    } else{
                        //the following user is already on the board
                        preExistingUsers += temp+', ';
                    }

                    temp = '';
                }
            }
            if(preExistingUsers != ''){
                preExistingUsers = preExistingUsers.substring(0,preExistingUsers.length-2);//remove the ', '

                    //check if custom box was included succesfully
                if(typeof swal === "function"){
                    swal("The following username(s) already exist on the leaderboard:", preExistingUsers);
                } else{
                    alert('The following username(s) already exist on the leaderboard: \n'+preExistingUsers);
                }
            }
            processArray();
        };
        reader.onerror = function(){
            if(typeof swal === "function"){
                swal('Unable to read ' + file.fileName);
            } else{
                alert('Unable to read ' + file.fileName);
            }
        };
    }

    function importUsers(evt){
        // Check for the various File API support.
        if (window.File && window.FileReader && window.FileList && window.Blob) {
            // All the File APIs are supported.
        } else {
            if(typeof swal === "function"){
                swal('The File APIs are not fully supported in this browser.');
            } else{
                alert('The File APIs are not fully supported in this browser.');
            }
        }

        var files = evt.target.files;
        var file = files[0];

        // read the file metadata
        if(file.type === 'application/vnd.ms-excel'){
            // read the file contents
            processImportedUsers(file);
        } else {
            if(typeof swal === "function"){
                swal('File type \'' + file.type + '\' is incorrect.', '\r\nUse a .cvs file.');
            } else{
                alert('File type \'' + file.type + '\' is incorrect. \r\nUse a .cvs file.');
            }
        }
    }

    function exportUsers(){
        let csvContent = "data:text/csv;charset=utf-8,";
        usersInfoList.forEach(function(infoArray, index){
            let dataString = infoArray.name;//+','+infoArray.level+',https://www.gravatar.com/avatar/'+infoArray.avatar_link+','+wkRealmNames[infoArray.realm_number]+','+infoArray.srs_distribution;
            csvContent += dataString + "\n";
        });
        if(usersInfoList.length != 0){
            let encodedUri = encodeURI(csvContent);
            let link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "my_leaderboard.csv");
            document.body.appendChild(link);
            link.click();
        } else {
            if(typeof swal === "function"){
                swal('There were no users to export.');
            } else{
                alert('There were no users to export.');
            }
        }
    }

    //see if account is an admin account
    function isAdmin(name){
        if($.inArray(name, adminNamesInfinity) != -1){
            return 'sym-∞ ' + adminIdentifier;
        } else if ($.inArray(name, adminNamesStar) != -1) {
            return 'sym-★ ' + adminIdentifier;
        } else if ($.inArray(name, adminNamesNone) != -1){
            return 'sym- ' + adminIdentifier;
        }
        return '';//not an admin account
    }

    //change admin level to ∞ or ★ or ' ' on hover
    function adminHovering(){
        $(".adminUserLeaderboard").hover(function(){
            let hoverSymbol = '∞';
            let symType = $(this)[0].className.substring(0,5);
            switch(symType) {
                case 'sym-∞':
                    hoverSymbol = '∞';
                    break;
                case 'sym-★':
                    hoverSymbol = '★';
                    break;
                default:
                    hoverSymbol = '';
            }
            $(this).children(':nth-child(2)').text(hoverSymbol);
        }, function(){
            $(this).children(':nth-child(2)').text($(this).children(':nth-child(2)')[0].className.substring(0,2));//turn symbol back to level
        });
    };

    //change leaderboard width
    function updateWidth(evt){//change icon when widened
        let classname = document.getElementsByClassName('leaderboardSpan');

        switch(evt.target.tableParam) {
            case 0:
                if(toggleLeaderboardWidth0){
                    shortenTable(classname, evt.target.tableParam);
                    toggleLeaderboardWidth0 = 0;
                } else {
                    widenTable(classname, evt.target.tableParam);
                    toggleLeaderboardWidth0 = 1;
                }
                break;
            case 1:
                if(toggleLeaderboardWidth1){
                    shortenTable(classname, evt.target.tableParam);
                    toggleLeaderboardWidth1 = 0;
                } else {
                    widenTable(classname, evt.target.tableParam);
                    toggleLeaderboardWidth1 = 1;
                }
                break;
            case 2:
                if(toggleLeaderboardWidth2){
                    shortenTable(classname, evt.target.tableParam);
                    toggleLeaderboardWidth2 = 0;
                } else {
                    widenTable(classname, evt.target.tableParam);
                    toggleLeaderboardWidth2 = 1;
                }
                break;
        }
    }

    function widenTable(classname, number){
        classname[number].setAttribute("style", "width: 100%;");
        classname[number].setAttribute("title", "Shorten screen");
    }

    function shortenTable(classname, number){
        classname[number].setAttribute("style", "width: ;");
        classname[number].setAttribute("title", "Widen screen");
    }

    function createLeaderboard() {
        let sectionContents = "";
        let timeSinceLastRefreshHtml = '';

        //console.log(usersInfoList);

        //loop to create multiple tables
        for (var i = 0; i < numberOfLeaderboardTables; i++){
            let numberOfUsersPerTable = usersInfoList.length/numberOfLeaderboardTables;
            let startNumberTable = Math.ceil(numberOfUsersPerTable*i);
            let endNumberTable = Math.floor((usersInfoList.length/numberOfLeaderboardTables)*(i+1));

            /*console.log('LOOP NUMBER:');
            console.log(i);
            console.log('number of users:');
            console.log(usersInfoList.length);
            console.log('number of tables:');
            console.log(numberOfLeaderboardTables);
            console.log('number of users per table:');
            console.log(numberOfUsersPerTable);
            console.log('start number:');
            console.log(startNumberTable);
            console.log('end number:');
            console.log(endNumberTable);
            console.log('--------------------------------------------------------------');*/

            //if userlist has three tables, an odd number of users and this is not the final table, add a user to the end
            if (numberOfLeaderboardTables == 2 && usersInfoList.length%2 != 0 && endNumberTable != usersInfoList.length){
                endNumberTable++;
            }

            //if userlist has three tables and tablelenght not a root of three
            if (numberOfLeaderboardTables == 3 && usersInfoList.length%3 != 0 && endNumberTable != usersInfoList.length){
                endNumberTable++;
            }


            //if userlist has an even number of user, three tables and this is not the final table, add a user to the end
            //if (usersInfoList.length%2 != 1 && endNumberTable != usersInfoList.length && ){
            //     endNumberTable++;
            // }
//

            //if this is not the final table add one more user to the end
            if(endNumberTable >= usersInfoList.length){
                //endNumberTable--;
            }

            //if this is not the final table add one more user to the end
            if(endNumberTable != usersInfoList.length){
                //endNumberTable++;
            }

            sectionContents += `
                <div class="leaderboardSpan span4">
                    <section class="kotoba-table-list dashboard-sub-section" style="position: relative;">
                        <h3 class="small-caps">Leaderboard</h3>
                        <i class="leaderboard-settings icon-plus" title="Add user" style="position:absolute; top:7.5px; right:5px;"></i>
                        <i class="leaderboard-refresh icon-refresh" title="Refresh leaderboard" style="position:absolute; top:7.5px; right:25px;"></i>
                        <i class="leaderboard-resize icon-resize-horizontal" title="Widen screen" style="position:absolute; top:7.5px; right:45px;"></i>
                        <i class="leaderboard-export icon-circle-arrow-down" title="Download leaderboard" style="position:absolute; top:7.5px; left:5px;"></i>
                        <input type="file" id="leaderboard-files-import" name="files[]" accept=".csv" multiple /><label class="icon-circle-arrow-up" for="leaderboard-files-import" title="Upload leaderboard" style="position:absolute; top:7.5px; left:25px;"></label>
                        <div id="leaderboard_loader" class="leaderboard_loader"></div>
                        <table>
                            <tbody>`;
            //if no users have been added yet
            if(usersInfoList.length == 0){
                timeSinceLastRefreshText = '0 days 0 hours 0 minutes';
                sectionContents += `<tr class="none-available">
                                        <td>
                                        <div>
                                            <i class="icon-user"></i>
                                        </div>
                                        You haven't added any users yet. <br /><br />
                                        Use (<i class='icon-plus' ></i>) to add users.
                                        </td>
                                    </tr>`
                timeSinceLastRefreshHtml = `<div class="see-more">
                                                <a class="small-caps">
                                                &nbsp;
                                                </a>
                                            </div>`;
            } else {
                timeSinceLastRefreshHtml = `<div class="see-more">
                                                <a class="small-caps" style="padding: 3.5px 15px 0px 15px;">Time since last refresh...</a>
                                                ${timeSinceLastRefreshText}
                                                (
                                                <a class="tooltipImg icon-question">
                                                    <span>
                                                        <strong style="background-color: black">**Updating Leaderboard**</strong><br />
                                                        <i style="background-color: black">Leaderboard updates only when refreshed (<i class='icon-refresh' ></i>) manually.</i>
                                                    </span>
                                                </a>
                                                )
                                            </div>`;
            }
            for (var j = startNumberTable; j < endNumberTable; j++){
                //check if user is admin
                let adminClass = isAdmin(usersInfoList[j].name);

                //check if username was valid
                let userErrorNotFoundMessage = usersInfoList[j].wasUserFound ? '' : accountNotFoundMessage;

                //calculate burn percentage
                let burnedTotal = usersInfoList[j].level != 3 ? `Total Burned: ${usersInfoList[j].srs_distribution[0].burnedTotal}, ${usersInfoList[j].totalBurnPercentage}%` : '&#9888; Users without subscription will show as level 3.';

                //for user achievements
                let userCelebrationIcon = '';
                //has user leveled up?
                if(usersInfoList[j].hasLeveledUp){userCelebrationIcon = 'icon-level-up';}
                //does user have 100% burned?
                if(usersInfoList[j].totalBurnPercentage >= 100){userCelebrationIcon = 'icon-trophy';}

                let burnPercentageGradient = usersInfoList[j].realm_number === 5 ? `background: linear-gradient(to right,
                    #faac05,
                    #faac05 ${usersInfoList[j].totalBurnPercentage}%,
                    rgba(255,255,255) ${usersInfoList[j].totalBurnPercentage+1.25}%,
                    #fbc550 ${usersInfoList[j].totalBurnPercentage+2.5}%);` : '';

                sectionContents += `<tr class="${leaderboardColors[usersInfoList[j].realm_number]}" style="${burnPercentageGradient}">
                                        <td style="text-align:center;" tooltip="${wkRealmNames[usersInfoList[j].realm_number]}">
                                            <span>${wkRealms[usersInfoList[j].realm_number]}</span>
                                        </td>
                                        <td tooltip="${burnedTotal}">
                                            <a href="users/${usersInfoList[j].name}" class="${adminClass}">
                                                <span>${usersInfoList[j].name + userErrorNotFoundMessage}</span>
                                                <span class="${usersInfoList[j].level} floatRight">${usersInfoList[j].level}</span>
                                                <i class="${userCelebrationIcon} floatRight"></i>
                                            </a>
                                        </td>
                                        <td class="${usersInfoList[j].name} leaderboard-userImg" tooltip="Remove user?">
                                            <img class="leaderboard-img-center" src="https://www.gravatar.com/avatar/${usersInfoList[j].avatar_link}?s=300&d=https://cdn.wanikani.com/default-avatar-300x300-20121121.png"/>
                                        </td>
                                    </tr>`;
            }
            sectionContents += `
                                </tbody>
                            </table>
                            ${timeSinceLastRefreshHtml}
                        </section>
                    </div>`;
        }
        let leaderboardTableStyle = '<div id="leaderboard" class="row">';
        sectionContents += `</div>`;

        //check if leaderboards is already there
        if(document.getElementById("leaderboard")) {
            $('#leaderboard').replaceWith(leaderboardTableStyle+sectionContents);//replace existing board
        } else {
            if ($('section.progression').length) {
                $('section.progression').after(leaderboardTableStyle);
            }
            else {
                $('section.srs-progress').after(leaderboardTableStyle);
            }
            $('#leaderboard').append(sectionContents);
        }

        //eventlisteners
        let classname = document.getElementsByClassName('leaderboard-settings');
        for (let i = 0; i < classname.length; i++) {
            classname[i].addEventListener('click', open_settings);
        }
        classname = document.getElementsByClassName('leaderboard-refresh');
        for (let i = 0; i < classname.length; i++) {
            classname[i].addEventListener('click', refreshDashboard);
        }
        classname = document.getElementsByClassName('leaderboard-resize');
        for (let i = 0; i < classname.length; i++) {
            classname[i].addEventListener('click', updateWidth);
            classname[i].tableParam = i;
        }
        classname = document.getElementsByClassName('leaderboard-export');
        for (let i = 0; i < classname.length; i++) {
            classname[i].addEventListener('click', exportUsers);
        }
        document.getElementById('leaderboard-files-import').addEventListener('change', importUsers);

        $('#leaderboard').find('.leaderboard-userImg').on('click', deleteUser);

        adminHovering();
    }

    startup();
})();
