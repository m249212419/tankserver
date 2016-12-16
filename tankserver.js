/**
 * Created by mazhipeng on 16/12/8.
 */

var express = require("express");
var app = express();
var server = require("http").createServer(app);
var io = require("socket.io")(server);

app.use(express.static(__dirname + "/public"));

//房间最大人数
var houseMaxNum = 4;
//房间ID
var houseId = 1;
//玩家ID
var playerId = 0;
//房间列表
var house = {};

//房间内玩家出生位置
var playerPos = [
    {x: 0, y: -192},
    {x: 192, y: -192},
    {x: 128, y: -192},
    {x: -192, y: -192},
    {x: -128, y: -192}
];
//玩家列表
var players = {};
//等待列表
var waitPlayers = [];

//状态
var playerState = {
    normal: 0,      //普通
    invincible: 1   //无敌
};

//玩家类型
var playerType = {
    self: 1,  //自己
    friend: 2,  //友军
    enemy: 3    //敌人

};

//坦克类型
var tankType = {
    normal:1,
    speed:2,
    big:3
};

var parseData = function (data) {
    if(typeof data == "string"){
        return eval("("+data+")");
    }else{
        return data;
    }
};


//用户连接
io.on("connection",
    function (socket) {
        var player = {
            playerID: playerId,
            angle: 0,
            pos:{},
            team: -1,
            playerType: playerType.self,
            tankType: tankType.normal,
            blood: 1,
            state: playerState.normal
        };
        players[playerId] = player;
        socket.playerID = playerId;

        playerId++;

        socket.emit("connection", { player: player });

        //断开连接
        socket.on("disconnect", function () {

            if (socket.houseID) {
                console.log("用户断线:"+socket.playerID);
                socket.broadcast.in(socket.houseID).emit("exit", { playerID: socket.playerID });

                socket.leave(socket.houseID);

                var ahouse = house[socket.houseID];
                for(var i = 0; i<ahouse.players.length; i++){
                    if(ahouse.players[i].playerID == socket.playerID){
                        ahouse.players.splice(i, 1);
                        break;
                    }
                }
                if (ahouse.players.length == 0) {
                    console.log("deleteHouse " + socket.houseID);
                    delete house[socket.houseID];
                }

            }
            for(var i = 0; i<waitPlayers.length; i++){
                if(waitPlayers[i].playerID == socket.playerID){
                    waitPlayers.splice(i, 1);
                    break;
                }
            }
            delete players[socket.playerID];

        });

        //进入房间
        socket.on("joinHouse", function (data) {

            data = parseData(data);

            //加入等待列表
            for(var j = 0; j < waitPlayers.length; j++){
                if(waitPlayers[j].playerID == socket.playerID){
                    return;
                }
            }

            waitPlayers.push(socket);
            var player = players[socket.playerID];
            player.tankType = data.tankType;

            //临时
            player.playerType = playerType.enemy;

            if(waitPlayers.length>=houseMaxNum){
                //取出前两个玩家
                var housePlayers = waitPlayers.splice(0, houseMaxNum);
                house[houseId] = { players: [] };

                var posIndex = 0;

                for(var i=0; i<houseMaxNum; i++) {
                    var player = players[housePlayers[i].playerID];
                    if(player.team == -1){
                        if(i<houseMaxNum/2){
                            player.team = 0;
                        }else{
                            if(i==houseMaxNum/2){
                                posIndex = 0;
                            }
                            player.team = 1;
                        }
                        player.pos = playerPos[posIndex];
                        posIndex++;
                    }

                    housePlayers[i].houseID = houseId;
                    housePlayers[i].join(houseId);
                    housePlayers[i].emit("joinHouse", {result: true, message: "进入房间成功"});
                }
                house[houseId].players = housePlayers;
                houseId++;

            }

        });

        //入场
        socket.on("onload", function () {
            var data = {};
            var curPlayer = players[socket.playerID];

            for(var i = 0; i< house[socket.houseID].players.length; i++){
                var playerID = house[socket.houseID].players[i].playerID;
                var player = players[playerID];
                if(player.team == curPlayer.team){
                    if(player.playerID == curPlayer.playerID){
                        player.playerType = playerType.self;
                    }else{
                        player.playerType = playerType.friend;
                    }

                }else{
                    player.playerType = playerType.enemy;
                }

                data[playerID] = player;
            }

            socket.emit("onload", { players: data });
        });

        //转向
        socket.on("rotation", function (data) {
            data = parseData(data);
            var player = players[socket.playerID];
            player.angle = data.angle;
            io.sockets.in(socket.houseID).emit("rotation", { playerID: player.playerID, team: player.team, angle: data.angle });

        });

        //移动
        socket.on("move", function (data) {
            data = parseData(data);
            var player = players[socket.playerID];
            player.pos = data.pos;
            io.sockets.in(socket.houseID).emit("move", { playerID: player.playerID, team: player.team, pos: player.pos });
            
        });

        //发射子弹
        socket.on("attack", function () {
            io.sockets.in(socket.houseID).emit("attack", { playerID: socket.playerID });
        });

        //杀死敌人
        socket.on("kill", function (data) {
            data = parseData(data);
            io.sockets.in(socket.houseID).emit("kill", { playerID: data.playerID, enemyID: data.enemyID });

            var player = players[data.enemyID];
            player.playerType = playerType.self;
            player.team = -1;
            player.pos = {};
            player.tankType = tankType.normal;

            var ahouse = house[socket.houseID];
            for(var i = 0; i<ahouse.players.length; i++){
                if(ahouse.players[i].playerID == data.enemyID){

                    ahouse.players[i].houseID = undefined;
                    ahouse.players.splice(i, 1);

                    break;
                }
            }
            var teamCount0 = 0;
            var teamCount1 = 0;
            for(var key in players){
                if(players[key].team == 0){
                    teamCount0++;
                }else if(players[key].team == 1){
                    teamCount1++;
                }
            }

            if(teamCount0==0 || teamCount1==0){
                console.log("================%d,%d",teamCount0,teamCount1);
                for(var key in players){
                    var player = players[key];
                    player.playerType = playerType.self;
                    player.team = -1;
                    player.pos = {};
                    player.tankType = tankType.normal;
                }

                //游戏结束
                io.sockets.in(socket.houseID).emit("gameOver", { teamCount0: teamCount0, teamCount1: teamCount1 });
            }


        });



    }

);


server.listen(5555, function () {
    console.log("listening on 5555");
});








































