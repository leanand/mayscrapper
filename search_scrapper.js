var Curl = require( 'node-libcurl' ).Curl;
var redis = require('redis');
var cheerio = require('cheerio');
var redisClient = redis.createClient();
var async = require('async');
var _ = require('lodash');

var url = "http://www.modelmayhem.com/browse/any/us/all/all{{page_no}}?fm_action=search&show_advanced=0&artist_type%5B%5D=&member_name=&display=details&sort_by=2&country=US&state=&city=&zipcode=&radius=&submit='";
var searchPageRegex =/<td class="bAvatar">\W*a href="\/(\d*)/g;
var userListKey = "USER_LIST";
function extractEmails ( text ){
	return text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi);
}

function fetchSearchPage(pageNo){
	console.log("Fetching page===> ", pageNo);
	var toBeReplaced = "";
	var requiredUrl = url;
	if(pageNo >=2){
		toBeReplaced = "/" + pageNo;
	}
	requiredUrl = requiredUrl.replace(/{{page_no}}/, toBeReplaced);
	
	var curl = new Curl();
	curl.setOpt( Curl.option.URL , requiredUrl );
	curl.setOpt( Curl.option.HTTPHEADER, [
		'Accept-Language: en-US,en;q=0.8',
		'Upgrade-Insecure-Requests: 1',
		'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2743.82 Safari/537.36',
		'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
		'Cache-Control: max-age=0',
		'Cookie: BIGipServermodelmayhem-varnish1_POOL=1750274058.52514.0000; optimizelyEndUserId=oeu1470085400298r0.07005144339170988; worksafe=1; ibCookiePolicyInformed=2; PHPSESSID=oc2cfb7gtra7fs6v28usjj7812; MM_SAT=aed78675588cab1b3553e09996216ab21886c10f21a5776469bf6d6a633cffd3b731c1218d43b73a2e40434466fa806cc5430cad4dc32f38d9cf7e5be7055a61; BIGipServermodelmayhem-web_POOL=1314066442.0.0000; optimizelySegments=%7B%222172731775%22%3A%22false%22%2C%222196310185%22%3A%22gc%22%2C%222198340143%22%3A%22direct%22%2C%222792680715%22%3A%22none%22%7D; optimizelyBuckets=%7B%7D; optimizelyPendingLogEvents=%5B%5D'
	]);

	return new Promise(function(resolve, reject){
		curl.on( 'end', function( statusCode, body, headers ) {
			this.close();
			if(statusCode === 200){
				resolve(body);
			}else{
				resolve(null);
			}
		});
		curl.on( 'error', function(){
			this.close();
			reject();
		});
		curl.perform();
	});
}

function fetchUserPage(userId){
	console.log("Fetching user===> ", userId);
	var requiredUrl = "www.modelmayhem.com/"+ userId;
	var curl = new Curl();
	curl.setOpt( Curl.option.URL , requiredUrl );
	curl.setOpt( Curl.option.HTTPHEADER, [
		'Accept-Language: en-US,en;q=0.8',
		'Upgrade-Insecure-Requests: 1',
		'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2743.82 Safari/537.36',
		'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
		'Cache-Control: max-age=0',
		'Cookie: BIGipServermodelmayhem-varnish1_POOL=1750274058.52514.0000; optimizelyEndUserId=oeu1470085400298r0.07005144339170988; worksafe=1; ibCookiePolicyInformed=2; PHPSESSID=oc2cfb7gtra7fs6v28usjj7812; MM_SAT=aed78675588cab1b3553e09996216ab21886c10f21a5776469bf6d6a633cffd3b731c1218d43b73a2e40434466fa806cc5430cad4dc32f38d9cf7e5be7055a61; BIGipServermodelmayhem-web_POOL=1314066442.0.0000; optimizelySegments=%7B%222172731775%22%3A%22false%22%2C%222196310185%22%3A%22gc%22%2C%222198340143%22%3A%22direct%22%2C%222792680715%22%3A%22none%22%7D; optimizelyBuckets=%7B%7D; optimizelyPendingLogEvents=%5B%5D'
	]);

	return new Promise(function(resolve, reject){
		curl.on( 'end', function( statusCode, body, headers ) {
			this.close();
			if(statusCode === 200){
				resolve(body);
			}else{
				resolve(null);
			}
		});
		curl.on( 'error', function(){
			this.close();
			reject();
		});
		curl.perform();
	});
}


function startPageSearching(pageNo){
	return fetchSearchPage(pageNo).then(function(body){
		var isMatching = searchPageRegex.exec(body);
		var limit = 0;
		var tempCache = [];
		while(isMatching && isMatching.length > 1){
			tempCache.push(isMatching[1]);
			isMatching = searchPageRegex.exec(body);
			limit ++;
		}
		console.log("Page completed ====>", pageNo , limit);
		pushToRedisUser(tempCache);
		async.mapSeries(tempCache, fetchUserFunction, function(error, data){
			if(data.length > 0){
				var requiredData = _.compact(data);
				requiredData = _.flatten(requiredData);	
				console.log(requiredData);
				redisClient.hmset("REQUIRED_EMAILS", requiredData);
				redisClient.set("LAST_PAGE", pageNo, function(error){
					if(pageNo < 10){
						pageNo = pageNo + 1;
						startPageSearching(pageNo);
					}
				});
			}else{
				redisClient.set("LAST_PAGE", pageNo, function(error){
					if(pageNo < 10){
						pageNo = pageNo + 1;
						startPageSearching(pageNo);
					}
				});
			}
			
			
		});

	}).catch(function(error){
		console.log(error);
	});
};

function pushToRedisUser(userId){
	return redisClient.sadd(userListKey, userId, function(error){
		if(error){
			throw Error(error);
		}
	});
};

function fetchUserFunction(userId, callback){
	return fetchUserPage(userId).then(function(body){
		var $ = cheerio.load(body);
		var requiredEmail ="";
		var classes = [".sidebar_box", ".profile_top", ".profile_about"];
		classes.forEach(function(classed){
			var html = $(classed).html();
			if(html){
				var mailExtracted = extractEmails(html);
				if(mailExtracted && mailExtracted.length > 0){
					requiredEmail += mailExtracted[0] + " ";
				}	
			}
		});
		if(requiredEmail.length > 0){
			console.log("Email Found => ",requiredEmail);
			callback(null, [userId, requiredEmail] );
		}else{
			console.log("No Email found");
			callback(null, null);
		}
	}).catch(function(error){
		console.log(error);
	});
}

startPageSearching(0);

// fetchUserFunction(3946270);


