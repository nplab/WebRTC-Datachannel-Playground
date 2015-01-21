/*
 BASED ON: http://louisstow.github.io/WebRTC/datachannels.html
 */

var dcCounter = 0;
var activeChannelCount = new Array();
var parameters = {};
var labelButtonToggle = false;
var t_startNewPackage = 0;
var offerer = false;
var npmSizetemp = 0;
var scheduler = new Worker("dist/worker.scheduler.js");

// get a reference to our FireBase database and child element: rooms
var dbRef = new Firebase("https://webrtc-data-channel.firebaseio.com/");
var roomRef = dbRef.child("rooms");

// shims - wrappers for webkit and mozilla connections
var PeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
var IceCandidate = window.mozRTCIceCandidate || window.RTCIceCandidate;
var SessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.RTCSessionDescription;


// #### Functions
// generate a unique-ish string for storage in firebase
function id() {
	return (Math.random() * 10000 + 10000 | 0).toString();
}

// wrapper to send data to FireBase
// - room: 	room id - generated by id()-function or read from url
function send(room, key, data) {
	roomRef.child(room).child(key).set(data);
}

// wrapper function to receive data from FireBase
function recv(room, type, cb) {
	roomRef.child(room).child(type).on("value", function(snapshot, key) {
		var data = snapshot.val();
		if (data) {
			cb(data);
		}
	});
}

// generic error handler
function errorHandler(err) {
	console.error(err);
}

// determine what type of peer we are,
// offerer or answerer.
var ROOM = location.hash.substr(1);
var type = "answerer";
var otherType = "offerer";

// no room number specified, so create one
// which makes us the offerer
if (!ROOM) {
	ROOM = id();
	type = "offerer";
	otherType = "answerer";
	$('#link').append(" (offerer) - <a href='#" + ROOM + "'>" + ROOM + "</a>");
	$('#dcStatusAnswerer').hide();
}

if (type === "answerer") {
	$('#link').append(" (answerer) - " + ROOM);
	$('div.npmControlOfferer').hide();
	
};

// options for the PeerConnection
var iceServer = {
	iceServers : [{
		url : "stun:23.21.150.121"
	}, {
		url : "stun:stun.l.google.com:19302"
	}, {
		url : "turn:numb.viagenie.ca",
		credential : "webrtcdemo",
		username : "louis%40mozilla.com"
	}]
};

// create the PeerConnection
var pc = new PeerConnection(iceServer);

pc.onicecandidate = function(e) {
	// take the first candidate that isn't null
	if (!e.candidate) {
		return;
	}
	pc.onicecandidate = null;

	// request the other peers ICE candidate
	recv(ROOM, "candidate:" + otherType, function(candidate) {
		pc.addIceCandidate(new IceCandidate(JSON.parse(candidate)));
	});

	// send our ICE candidate
	send(ROOM, "candidate:" + type, JSON.stringify(e.candidate));
	
	updatePeerConnectionStatus(e);
};

pc.onsignalingstatechange  = function(event) {
	updatePeerConnectionStatus(event);
};

pc.oniceconnectionstatechange = function(event) {
	updatePeerConnectionStatus(event);
};

// constraints on the offer SDP.
var constraints = {};

// define the channel var
var channels = new Object();

connect();

// start start peer connection
function connect() {
	if (type === "offerer") {
		offerer = true;
		$('#createDataChannel').prop("disabled", false);
		// Button "createDataChannel" anabled for offerer
		createDataChannel('init');
		// create the offer SDP
		pc.createOffer(function(offer) {
			pc.setLocalDescription(offer);

			// send the offer SDP to FireBase
			send(ROOM, "offer", JSON.stringify(offer));

			// wait for an answer SDP from FireBase
			recv(ROOM, "answer", function(answer) {
				pc.setRemoteDescription(new SessionDescription(JSON.parse(answer)));
			});
		}, errorHandler, constraints);

		console.log("creating offer");

	} else {
		offerer = false;
		$('#createDataChannel').prop("disabled", true);
		// Button "createDataChannel" disabled for answerer

		// answerer must wait for the data channel
		pc.ondatachannel = function(e) {
			var channel = e.channel;
			bindEvents(channel);

			console.log('incoming datachannel');


			channels[channel.label] = {
				channel: channel,
				statistics : {
					t_start 			: 0,
					t_end 				: 0,
					t_last				: 0,
					npmPktRxAnsw 		: 0,
					npmPktTx			: 0,
					npmBytesRx 			: 0,
					npmBytesTx			: 0,
					npmBytesRxAnsw		: 0,
					npmSize 			: 0,
					npmParameterSleep 	: 500,
					npmPktCount 		: 10,
					rateAll				: 0,
					npmBytesLost		: 0,
					npmPktLost			: 0,
				}
			};
			updateChannelStatus();
		};

		// answerer needs to wait for an offer before
		// generating the answer SDP
		recv(ROOM, "offer", function(offer) {
			pc.setRemoteDescription(new SessionDescription(JSON.parse(offer)));

			// now we can generate our answer SDP
			pc.createAnswer(function(answer) {
				pc.setLocalDescription(answer);

				// send it to FireBase
				send(ROOM, "answer", JSON.stringify(answer));
			}, errorHandler, constraints);
		});
		console.log('connect passive');
	}
}

//Create Datachannels
function createDataChannel(label) {
	// 	

	var dataChannelOptions;
	if(typeof parameters[label] != 'undefined'){
		switch(parameters[label].reliableMethode){
			case "reliable":
				dataChannelOptions = {
				};
				break;
			case "maxRetransmit":
				dataChannelOptions = {
					maxRetransmits		: parameters[label].reliableParam,
				};
				break;
			case "maxTimeout":
				dataChannelOptions = {
					maxRetransmitTime	: parameters[label].reliableParam,
				};
				break;
		}
	}
		

	// offerer creates the data channel
	var tempChannel = pc.createDataChannel(label, dataChannelOptions);
	bindEvents(tempChannel);
	
	channels[tempChannel.label] = {
		channel : tempChannel,
		statistics: {
			t_start 			: 0,
			t_end 				: 0,
			t_last				: 0,
			npmPktRxAnsw 		: 0,
			npmPktTx			: 0,
			npmBytesRx 			: 0,
			npmBytesTx			: 0,
			npmBytesRxAnsw		: 0,
			npmSize 			: 0,
			npmParameterSleep 	: 500,
			npmPktCount 		: 10,
			rateAll				: 0,
			npmBytesLost		: 0,
			npmPktLost			: 0,
		}
		
	};
	updateChannelStatus();
	console.log("datachannel created - label:" + tempChannel.id + ', id:' + tempChannel.label);
}

function closeDataChannel(label) {
	channels[label].channel.close();
}

function NpmSend(label, message) {
	// console.log("datachannel send - label:" + label + ' - sleep:' + parameters[label].sleep);
	try {
		channels[label].channel.send(message);
		channels[label].statistics.npmPktTx++;
		channels[label].statistics.npmBytesTx += message.length;
		if (channels[label].statistics.npmPktTx <= parameters[label].pktCount) {
			// setTimeout(function(){
				// NpmSend(label,message);
			// }, parameters[label].sleep);
			
			var schedulerObject = {
				sleep 	: parameters[label].sleep,
				label 	: label,
				data	: message,
			};
			scheduler.postMessage(schedulerObject);
			
		} else {
			channels[label].channel.close();
		}
	} catch(e) {
		alert("Test Aborted!");
		console.log(e);
		return;
	}
	//updateChannelState();
};

function funct() {
};

//
function parseParameters(){
	

	$('#npmChannelParameters > tbody > tr').each(function(){	
		parameters[$(this).find('button[name="toggleActive"]').val()] = {

			active: 		$(this).find('button[name="toggleActive"]').hasClass("btn-primary"),
			label:  		$(this).find('button[name="toggleActive"]').val(),
			pktSize: 		$(this).find('input[name="paramPktSize"]').val(),
			pktCount: 		$(this).find('input[name="paramPktCount"]').val(),
			sleep: 			$(this).find('input[name="paramSleep"]').val(),
			reliableMethode:$(this).find('button.dropdown-toggle').data('method'),
			reliableParam:  $(this).find('input[name="paramReliable"]').val()
		
		};
	});
}

//
function netPerfMeter() {	
	var channelNo = -1;
	var accc = 0;

	parseParameters();

	for(var key in parameters){
		if (parameters.hasOwnProperty(key)) {
			if(parameters[key].active == true){
				createDataChannel(key);
				activeChannelCount[accc] = key;
				accc++;
			}
		}
	}
	
	
}
//
function netPerfMeterRunByTrigger(label){


	for(var i = 0; i < activeChannelCount.length; i++){			
		if(activeChannelCount[i] == label) {
			var DataArray = new Array(1, parameters[activeChannelCount[i]].sleep, parameters[activeChannelCount[i]].pktSize, parameters[activeChannelCount[i]].pktCount);
			var DataString = DataArray.join(";");
			channels[activeChannelCount[i]].channel.send(DataString);
			channels[activeChannelCount[i]].statistics.npmBytesTx = (1 + parameters[activeChannelCount[i]].sleep.length + parameters[activeChannelCount[i]].pktSize.length + parameters[activeChannelCount[i]].pktCount.length);
			
			npmPaket = "";
			for (var j = 0; j < parameters[activeChannelCount[i]].pktSize; j++) {
				npmPaket += "a";
			}
			NpmSend(activeChannelCount[i], npmPaket);
		}

	}
}

// bind the channel events
function bindEvents(channel) {
	channel.onopen = function() {
		console.log("datachannel opened - label:" + channel.label + ', ID:' + channel.id);
		
		if(offerer == true){
			netPerfMeterRunByTrigger(channel.label);
		}
		updateChannelStatus();
	};

	channel.onclose = function(e) {
		console.log("datachannel closed - label:" + channel.label + ', ID:' + channel.id);
		if(offerer == false){
			sendStatistics(e);
		}
		updateChannelStatus();
	};

	window.onbeforeunload = function() {
		channel.close();
	};

	channel.onmessage = function(e) {
		console.log('incoming message: ' + e.data);
		
		if(e.currentTarget.label == 'init') {
			handleJsonMessage(e.data);
		} else if(offerer == false){
			answererOnMessage(e);
		} 
	};
}

scheduler.onmessage = function(e) {
	var message = e.data;
	
	if(message.label != undefined && message.sleep != undefined && message.data != undefined) {
		NpmSend(message.label, message.data);
	}
};

function sendStatistics(e){
	var tempChannelLabel = e.currentTarget.label;
	alert("stats");
	var jsonObjStats = {
		type 		: 'stats',
		label 		: tempChannelLabel,
		stats 		: channels[tempChannelLabel].statistics,
	};

	channels.init.channel.send(JSON.stringify(jsonObjStats));
}

function answererOnMessage(e){		
	rxData = e.data.toString();
	// console.log("Message for "+e.currentTarget.label + " - content:" + rxData.length);
	var tempChannelLabel = e.currentTarget.label;
	var rxnpmPaketTemp = rxData.split(";");

	if (rxnpmPaketTemp[0] == 1) {
		messageencoder = 1;
	} else
		messageencoder = 2;

	switch(messageencoder) {
		case 1:
			channels[tempChannelLabel].statistics.npmSizePerX 		= 0; 
			channels[tempChannelLabel].statistics.npmPktRxAnsw 		= 0; 
			
			var rxDataString = rxData;
			var rxDataArray = rxDataString.split(";");
			
			channels[tempChannelLabel].statistics.npmParameterSleep 	= parseInt(rxDataArray[1]);
			channels[tempChannelLabel].statistics.npmSize 				= parseInt(rxDataArray[2]);
			npmSizetemp = channels[tempChannelLabel].statistics.npmSize;
			channels[tempChannelLabel].statistics.npmPktCount 			= rxDataArray[3];

			channels[tempChannelLabel].statistics.t_start = new Date().getTime();
			break;
		case 2:
			channels[tempChannelLabel].statistics.t_end = new Date().getTime();
			channels[tempChannelLabel].statistics.npmBytesRx += rxData.length;
			channels[tempChannelLabel].statistics.npmPktRxAnsw++;
			break;
	}
}

function handleJsonMessage(message) {
	var messageObject = JSON.parse(message);
	var tempChannelLabel = messageObject.label;

	switch(messageObject.type) {
		case 'stats':
			channels[tempChannelLabel].statistics.t_start 			= messageObject.stats.t_start;
			channels[tempChannelLabel].statistics.t_end 			= messageObject.stats.t_end;
			channels[tempChannelLabel].statistics.t_last 			= messageObject.stats.t_end - messageObject.stats.t_start;
			channels[tempChannelLabel].statistics.npmBytesRxAnsw	= messageObject.stats.npmBytesRx;
			channels[tempChannelLabel].statistics.npmPktRxAnsw		= messageObject.stats.npmPktRxAnsw;
			channels[tempChannelLabel].statistics.rateAll			= messageObject.stats.npmBytesRx / ((messageObject.stats.t_end - messageObject.stats.t_start) / 1000);
			channels[tempChannelLabel].statistics.npmBytesLost		= channels[tempChannelLabel].statistics.npmBytesTx - messageObject.stats.npmBytesRx;
			channels[tempChannelLabel].statistics.npmPktLost		= channels[tempChannelLabel].statistics.npmPktTx - messageObject.stats.npmPktRxAnsw;

			console.log(channels[tempChannelLabel].statistics);
			break;
		case 'timestamp':
			handlePing(messageObject);
			break;
		case 'timestampEcho':
			handlePingEcho(messageObject);
			break;
		default:
			alert('Unknown messagetype!!');
			break;
	}
}

/*
 * Send a message to peer with local timestamp
 */
function ping() {
	var date = new Date();
	timestampMessage = {
		type		: 'timestamp',
		timestamp	: date.getTime(),
	};
	channels.init.channel.send(JSON.stringify(timestampMessage));
	console.log('ping - sending timestamp to peer: ' + timestampMessage.timestamp);
}

/*
 * Echo received timestamp to peer
 */
function handlePing(message) {
	var timestampEcho = message;
	timestampEcho.type = 'timestampEcho';
	channels.init.channel.send(JSON.stringify(timestampEcho));
	console.log('handlePing - echo received timestamp to peer: ' + timestampEcho.timestamp);
}

/*
 * 
 */
function handlePingEcho(message) {
	var date = new Date();
	var t_delta = date.getTime() - message.timestamp;
	$('#npmcPing .rtt').html(' - RTT: '+t_delta + ' ms');
	console.log('handlePingEcho - received echoed timestamp from peer - RTT: ' + t_delta);
}
