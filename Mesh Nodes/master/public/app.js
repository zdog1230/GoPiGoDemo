var socket = io();
var active = 0;
var lled = 0;
var rled = 0;
var name = "Nichols";
var status = 0;
var oldName = "";
var lidar = 0;

socket.on('connect', function() {
    document.getElementById("status").innerHTML = "Socket Status: Connected";
});
socket.on('disconnect', function() {
    document.getElementById("status").innerHTML = "Socket Status: Disconnected";
});

socket.on('message', function(data) {
    if (data.online) {
        if (data.online != status || oldName != name) {
            oldName = name;
            status = data.online;
            if (name != "*") {
                if (status == 0) {
                    document.getElementById('rlatency').style.display = "none";
                    document.getElementById('table-container').style.display = "none";
                    document.getElementById("robotstatus").innerHTML = '<h4 class="center red-text">' + name + ' is Offline</h4>';
                } else {
                    document.getElementById('rlatency').style.display = "block";
                    document.getElementById('table-container').style.display = "block";
                    document.getElementById("robotstatus").innerHTML = '<h4 class="center green-text">' + name + ' is Online</h4>';
                }
            } else {
                document.getElementById('rlatency').style.display = "none";
                document.getElementById('table-container').style.display = "none";
                document.getElementById("robotstatus").innerHTML = '<h4 class="center green-text">Connected to ALL Active Robots</h4>';
            }
        }
    }
});

function updateTable(data) {
    var latency = Date.now() - data.time;
    var latencyString = "Data Latency: " + Math.abs(latency) + "ms";
    document.getElementById("rlatency").innerHTML = latencyString;
    document.getElementById("rname").innerHTML = data.name;
    if (data.type == "") {
        document.getElementById("rtype").innerHTML = "N/A";
    } else {
        document.getElementById("rtype").innerHTML = data.type;
    }
    if (data.type == "gopigo") {
        if (data.packet == "info") {
            document.getElementById("rstatus").innerHTML = data.data[0].robotState;
            document.getElementById("rrled").innerHTML = data.data[0].rightLed;
            document.getElementById("rlled").innerHTML = data.data[0].leftLed;
        }
        if (data.packet == "encoders") {
            document.getElementById("rrencoder").innerHTML = data.data[0].encoders[0];
            document.getElementById("rlencoder").innerHTML = data.data[0].encoders[1];
        }
    }
}
socket.on('robotData', function(data) {
    if (data.name == name.toLowerCase()) {
        if ((data.packet == "encoders") || (data.packet == "info")) {
            updateTable(data);
        }
    }
});

function toggleLed(e) {
    if (e == 'l') {
        if (lled == 0) {
            sendMessage('left led on');
            lled = 1;
        } else {
            sendMessage('left led off');
            lled = 0;
        }
    } else if (e == 'r') {
        if (rled == 0) {
            sendMessage('right led on');
            rled = 1;
        } else {
            sendMessage('right led off');
            rled = 0;
        }
    }
}

function changeName() {
    let d = prompt("Please enter robot name");
    sendMessage('x');
    name = d;
    sendMessage('x');
    if (name != "*") {
        document.getElementById("robo").innerHTML = "Drive " + name;
        document.getElementById("title").innerHTML = name + " Web Panel";
        document.getElementById("logo-container").innerHTML = name + " Web Panel";
    } else {
        document.getElementById("robo").innerHTML = "Drive All";
        document.getElementById("title").innerHTML = "Web Panel";
        document.getElementById("logo-container").innerHTML = "Web Panel";
    }
}

function servoTest() {
    socket.emit('message', 'servo test');
}

function sendMessage(command) {
    let robo = name;
    if (robo != "") {
        var data = {
            "bot": robo,
            "command": command
        };
        socket.emit('message', data);
    }
}

function drivebot(e) {
    var evtobj = window.event ? event : e; //distinguish between IE's explicit event object (window.event) and Firefox's implicit.
    var unicode = evtobj.charCode ? evtobj.charCode : evtobj.keyCode;
    var actualkey = String.fromCharCode(unicode);
    var data = "Command Sent: "
    //Forwards
    if ((evtobj.keyCode == 119) && (active != evtobj.keyCode)) {
        active = 119;
        data += "Forward";
        sendMessage('w');
        document.getElementById("command").innerHTML = data;
    }
    //Backwards
    else if ((evtobj.keyCode == 115) && (active != evtobj.keyCode)) {
        active = 115;
        data += "Backward";
        sendMessage('s');
        document.getElementById("command").innerHTML = data;
    }
    //Left
    else if ((evtobj.keyCode == 97) && (active != evtobj.keyCode)) {
        active = 97;
        data += "Left";
        sendMessage('a');
        document.getElementById("command").innerHTML = data;
    }
    //Right
    else if ((evtobj.keyCode == 100) && (active != evtobj.keyCode)) {
        active = 100;
        data += "Right";
        sendMessage('d');
        document.getElementById("command").innerHTML = data;
    }


}

function stopbot(e) {
    active = 0;
    var data = "Command Sent: ";
    data += "Stop";
    sendMessage('x');
    document.getElementById("command").innerHTML = data;
}

function viewLidar() {
  var botName = name.toLowerCase();
    window.open(window.location.href+"lidar/"+botName,
        "mywindow", "menubar=1,resizable=1,width=400,height=400");
}

document.onkeypress = drivebot;
document.onkeyup = stopbot;
