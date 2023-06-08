const serverless = require('serverless-http');
const http = require('http');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const { URLSearchParams } = require('url');
const url = require('url');

const app = express();


//QANTAS ORG Prod Oauth Code Grant 
const other_wrapupcode='fa3776ef-7912-4b86-9735-90914bfb9821';//this is default wrapupcode 'OTHER' in Qantas org, incase request doesnt send wrapupcode/undefined will overwrite to OTHER

const clientId = '73bf6545-1aa0-46aa-9493-40af18d5fb05';
const clientSecret = '5DgHjlyzdKJYFjeWXFDWCyLrN_t9-GkZullLm6TC_0c';

const environment = 'mypurecloud.com.au';
console.log(`QANTAS Org: clientid: ${clientId} clientSecret: ${clientSecret} environment: ${environment}`);
//QANTAS ORG

const PORT = '8085';

let origURL='';

let res_window;

let firstAuth=false;
let first_method='';
let first_url='';




const authvalidation = function(req, res, next) {

    console.log(`@@ it hit authvalidation with url:   \n[${req.method} ${req.url}]  and firstAuth is ${firstAuth}`);

    if(firstAuth==true){
        console.log('this come from first request that not authenticated, so make another request');
        console.log(`@@ it hit authvalidation with url firstAuth true :   \n[${req.method} ${req.url}]  and firstAuth is ${firstAuth}`);
        firstAuth=false;
        first_method='';
        let back_first_url=first_url;
        first_url='';

        console.log('CLEARING firstAuth: '+firstAuth+ ' first_method: '+first_method+ ' first_url: '+first_url +' back_first_url: '+back_first_url);
        console.log('calling doWrapup with request: '+back_first_url);
        doWrapup(back_first_url);
    }

    console.log('-----------------');
    console.log('below is req.cookies');
    console.log(req.cookies);
    console.log('below is req.cookies.session');
    console.log(req.cookies.session);   
    console.log('-----------------');

    // If we don't have a session then redirect them to the login page
    if((req.cookies && !(req.cookies.session && sessionMap[req.cookies.session])) && req.url.indexOf('oauth') == -1)
    {

        console.log(`@@ FIRSTTIME it hit authvalidation with url:   ${req.method}   ${req.url}`);

        firstAuth=true;
        first_method=req.method;
        first_url=req.url;

        console.log('@@ FIRSTTIME firstAuth: '+firstAuth+' first_method: '+first_method+' first_url: '+first_url);


        console.log('sessionMap[req.cookies.session] '+sessionMap[req.cookies.session]);
        console.log(' req.url.indexOf(oauth) == -1: '+ req.url.indexOf('oauth') == -1);

        origURL=req.url;
        var originloc =getFormattedUrl(req);
        console.log('authvalidation origURL: '+origURL +' originloc: '+originloc);

        //redirect the user to authorize with Genesys Cloud
        //var redirectUri='https://login.mypurecloud.com.au/oauth/authorize?response_type=code&client_id='+clientId+'&redirect_uri=http://localhost:8085/oauth2/callback';
        var redirectUri=`https://login.mypurecloud.com.au/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${originloc}/prod/oauth2/callback`;
        res.redirect(redirectUri);

        return;
    }
    else{
        firstAuth=false;
        first_method=req.method;
        first_url=req.url;

        console.log('this is not firstAuth, so clearing value of firstAuth, first_method and first_url');
        console.log('firstAuth: '+firstAuth+ ' first_method: '+first_method+ ' first_url: '+first_url+' run dowrapup with url: '+first_url);



        (async () => {
            try {
                const response = doWrapup(first_url);
                console.log('doWrapup finished with request: '+first_url);
                console.log('doWrapup status : '+JSON.stringify(response));
            } catch (error) {
                console.log('doWrapup ERROR finished with request: '+first_url);
                console.log('doWrapup ERROR status : '+JSON.stringify(error));
            }
        })();

    }
    console.log(`authvalidation value of origURL: ${origURL}`);
    // if we do have a session, just pass along to the next http handler
    console.log('authvalidation Session exists, not need redirect the user to authorize with Genesys Cloud, just pass along the next http handler');
    next();

};


app.use(cookieParser());
app.use(authvalidation);
app.use(express.static(__dirname));

var sessionMap ={};



app.get('/oauth2/callback', async function(req,res){

    console.log(`@@ it hit /oauth2/callback with url:   ${req.method}   ${req.url}`);
    // The authorization page has called this callback and now we need to get the bearer token
    console.log(`oauth callback with authCode: ${req.query.code}`);
    const authCode = req.query.code;

    var originloc =getFormattedUrl(req);
    console.log(`oauth callback originloc: ${originloc}'/prod/oauth2/callback`);

    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', authCode);
    //params.append('redirect_uri', `http://localhost:${PORT}/oauth2/callback`);
    params.append('redirect_uri', `${originloc}/prod/oauth2/callback`);

    axios({
        url: `https://login.${environment}/oauth/token`, 
        method: 'post',
        headers: {
           'Content-Type': 'application/x-www-form-urlencoded',
           'Authorization': `Basic ${Buffer.from(clientId + ':' + clientSecret).toString('base64')}`
        },
        params: params
    })
    .then(response => {
        const tokenData = response.data;
        console.log(`oauth callback got GENESYS CLOUD BEARER TOKEN data back: ${tokenData}`);

        var sessionId = uuidv4();

        sessionMap[sessionId] = tokenData.access_token;

        // Send the session id back as a cookie
        res.cookie('session', sessionId);
        console.log(`oauth callback @@ origURl:  https://nwe6x4ttz2.execute-api.ap-southeast-2.amazonaws.com/prod${origURL}`);
        res.redirect(`https://nwe6x4ttz2.execute-api.ap-southeast-2.amazonaws.com/prod${origURL}`);
    })
    .catch(e => console.error(e));
});



app.get('/', function(req, res){
    console.log(`@@!! it hit / with url:   ${req.method}   ${req.url}`);
    //window.close();
    res.render('https://nwe6x4ttz2.execute-api.ap-southeast-2.amazonaws.com/prod/info.html');
})






app.get('/updatewrapup/:conversationId&:purecloudWrapupCode&:userid', function(req, res){

    res.setHeader('Content-Type', 'text/html'); 

    console.log(`@@ it hit /updatewrapup/:conversationId&:purecloudWrapupCode&:userid with url:   ${req.method}   ${req.url}`);
    const oauthId = sessionMap[req.cookies.session];
    console.log(`updatewrapup Genesys Cloud BearerToken: ${oauthId}`);

    var conversationId= req.params.conversationId;
    var purecloudWrapupCode=req.params.purecloudWrapupCode;
    var userid=req.params.userid;
    var casenumber='';

    console.log(`updatewrapup conversationId: ${conversationId}`);
    console.log(`updatewrapup purecloudWrapupCode: ${purecloudWrapupCode}`);
    console.log(`updatewrapup userid: ${userid}`);

    if(purecloudWrapupCode=='undefined'){
        purecloudWrapupCode=other_wrapupcode;
        console.log(`updatewrapup purecloudWrapupCode become ${purecloudWrapupCode} or Other to replace undefined.`);
    }

    //var json ={wrapup: {code: `${purecloudWrapupCode}`,name:  `${wrapupResult}`}};
    var json ={wrapup: {code: `${purecloudWrapupCode}`}};

    console.log(`updatewrapup PATCH json : ${JSON.stringify(json)}`);

    const headers = { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${oauthId}`
    };

    res.write(`<p><h4>WrapUp is IN Progress, Please Do Not Close this Window!</h4></p><p> with request:<ul><li>conversationId: ${conversationId}</li><li>userid: ${userid}</li><li>wrapupcode: ${purecloudWrapupCode}</li></ul></p>`);


    axios.get(`https://api.mypurecloud.com.au/api/v2/conversations/calls/${conversationId}`, { headers })
    .then((response) => {
        console.log(`updatewrapup Genesys API GET CONVERSATION response data: ${JSON.stringify(response.data)}`);
        console.log(`updatewrapup Genesys API GET CONVERSATION response status: ${response.status}`);
        console.log(`updatewrapup Genesys API GET CONVERSATION response statusText: ${response.statusText}`);
        if(response.status==200){
            //get agent participantid
            var agent_participantid='';
            var agent_participantid_exist=false;
            var participants=Array.isArray(response.data.participants) ? response.data.participants :null;
            if(participants!=null)
            {
                console.log(`updatewrapup Genesys API participants is an arrays with length: ${participants.length}`);
                participants.forEach(function (participant) {
                    var purpose = participant.purpose;
                    var direction= participant.direction ? participant.direction:'';
                    if(purpose=='agent'){
                            agent_participantid_exist=true;
                            //get userid
                            var participant_userid = participant.user ? participant.user.id :'';
                            if(participant_userid==userid)
                            {
                                agent_participantid=participant.id;
                                console.log(`updatewrapup Genesys API found agent participantid: ${agent_participantid} purpose:agent`);
                            }
                    }
                    else if(purpose=='customer'){
                        casenumber = participant.attributes ? participant.attributes.CaseNumber ? participant.attributes.CaseNumber :'' : '';
                    }
                    else if(purpose=='user' && direction=='outbound'){
                        agent_participantid_exist=true;
                        //get userid
                        var participant_userid = participant.user ? participant.user.id :'';
                        if(participant_userid==userid)
                        {
                            agent_participantid=participant.id;
                            console.log(`updatewrapup Genesys API found agent participantid: ${agent_participantid} purpose:user, direction:outbound`);
                        }
                    }                    
                });
                if (agent_participantid!=''){
                    axios.patch(`https://api.mypurecloud.com.au/api/v2/conversations/calls/${conversationId}/participants/${agent_participantid}`, json, { headers })
                    .then(wrapupres => {
                        const wrapupResult = {status:`${wrapupres.status}`, statusText:`${wrapupres.statusText}`, casenumber: `${casenumber}`, conversationId: `${conversationId}`, agentid: `${agent_participantid}`, wrapupcode: `${purecloudWrapupCode}` };
                        console.log(`updatewrapup Genesys API PATCH WRAPUP - Status: ${wrapupres.status} statusText: ${wrapupres.statusText}  casenumber: ${casenumber}  conversationId: ${conversationId}  agentid: ${agent_participantid}  wrapupcode: ${purecloudWrapupCode}`);
                        res.end(`<br/><br/><hr><p>Wrapup is NOW completed, with result:<ul><li>status:${wrapupres.status} - ${wrapupres.statusText}</li><li>casenumber: ${casenumber}</li><li>conversationId: ${conversationId}</li><li>agent participant: ${agent_participantid}</li><li>wrapupcode: ${purecloudWrapupCode}</li></ul></p>`);
                    })
                    .catch(error =>{
                        console.log(error);
                        res.end(`<br/><br/><br/><hr><p><h2>RESULT: Internal Server Error.. >> Right Click on this Window and click "Reload".</h2></p>`);
                    });
                }//if loop get participant with purpose agent MATCHED with userid
                else{
                    //if found agent participantid but NOT MATCHED with userid sent from request
                    if(agent_participantid_exist){
                        const wrapupResult = {API_participant_status:`${response.status}`, API_participant_statusText: `${response.statusText}`, casenumber: `${casenumber}`, conversationId: `${conversationId}`, agentid: `${agent_participantid}`, wrapupcode: `${purecloudWrapupCode}`, explaination:`UserID sent from Wrapup aws lambda ${userid} not matched with any participant with purpose agent Wrapup from Salesforce is unsuccesful, Please open Phone Widget and do wrapup from Phone to continue.`};
                        console.log(JSON.stringify(wrapupResult));
                        res.end(`<br/><br/><br/><hr><h3>Result: Internal Server Error ${response.status} - ${response.statusText} (userid sent from SF not matched with any participant)</h3><br/><h2>Right Click on this Window and click "Reload".</h2>`);
                    }
                    //if UNABLE found any participant with purpose agent
                    else{
                        const wrapupResult = {API_participant_status:`${response.status}`, API_participant_statusText: `${response.statusText}`, casenumber: `${casenumber}`, conversationId: `${conversationId}`, agentid: `${agent_participantid}`, wrapupcode: `${purecloudWrapupCode}`, explaination:`ERROR array loop unable to get participant with purpose agent Wrapup from Salesforce is unsuccesful, Please open Phone Widget and do wrapup from Phone to continue.`};
                        console.log(JSON.stringify(wrapupResult));
                        res.end(`<br/><br/><br/><hr><h3>Internal Server Error ${response.status} - ${response.statusText} (unable to get participant with purpose user)</h3><br/><h2>Right Click on this Window and click "Reload".</h2>`);
                    }
                }
            }//if participants!=null
            else{
                const wrapupResult = {API_participant_status:`${response.status}`, API_participant_statusText: `${response.statusText}`, casenumber: `${casenumber}`, conversationId: `${conversationId}`, agentid: `${agent_participantid}`, wrapupcode: `${purecloudWrapupCode}`, explaination:`ERROR participants array is null unable to get any participant list from Genesys cloud API Wrapup from Salesforce is unsuccesful, Please open Phone Widget and do wrapup from Phone to continue.`};
                console.log(JSON.stringify(wrapupResult));
                res.end(`<br/><br/><br/><hr><h3>Internal Server Error ${response.status} - ${response.statusText} (unable to get any particpant list from genesys cloud API)</h3><br/><h2>Right Click on this Window and click "Reload".</h2>`);
            }
        }//if response 200 to get agent participantid
        else{
            const wrapupResult = {API_participant_status:`${response.status}`, API_participant_statusText: `${response.statusText}`, casenumber: `${casenumber}`, conversationId: `${conversationId}`, agentid: `${agent_participantid}`, wrapupcode: `${purecloudWrapupCode}`, explaination:`[Unable to get agent participantid], PLEASE RIGHT CLICK ON THIS WINDOW and CLICK "RELOAD"`};
            console.log(JSON.stringify(wrapupResult));
            res.end(`<br/><br/><br/><hr><h3>Internal Server Error ${response.status} - ${response.statusText} (unable to get participantid)</h3><br/><h2>Right Click on this Window and click "Reload".</h2>`);
        }
    })
    .catch(error =>{
        console.log(error);
        res.end(`<br/><br/><br/><hr><p><h2>RESULT: Internal Server Error.. >> Right Click on this Window and click "Reload".</h2></p>`);
    });
});


//set in a function
function doWrapup(theurl){
    //request has conversationId, wrapupcode and userid 
    console.log(`doWrapup started with url: ${theurl}`);
app.get(theurl, function(req, res){

        res.setHeader('Content-Type', 'text/html'); 

        console.log(`@@ it hit FUNCTION DOWRAPUP /updatewrapup/:conversationId&:purecloudWrapupCode&:userid with url:   ${req.method}   ${req.url}`);
        const oauthId = sessionMap[req.cookies.session];
        console.log(`DOWRAPUP updatewrapup Genesys Cloud BearerToken: ${oauthId}`);

        var conversationId= req.params.conversationId;
        var purecloudWrapupCode=req.params.purecloudWrapupCode;
        var userid=req.params.userid;
        var casenumber='';

        console.log(`DOWRAPUP updatewrapup conversationId: ${conversationId}`);
        console.log(`DOWRAPUP updatewrapup purecloudWrapupCode: ${purecloudWrapupCode}`);
        console.log(`DOWRAPUP updatewrapup userid: ${userid}`);

        if(purecloudWrapupCode=='undefined'){
            purecloudWrapupCode=other_wrapupcode;
            console.log(`DOWRAPUP updatewrapup purecloudWrapupCode become ${purecloudWrapupCode} or Other to replace undefined.`);
        }

        //var json ={wrapup: {code: `${purecloudWrapupCode}`,name:  `${wrapupResult}`}};
        var json ={wrapup: {code: `${purecloudWrapupCode}`}};

        console.log(`DOWRAPUP updatewrapup PATCH json : ${JSON.stringify(json)}`);

        const headers = { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${oauthId}`
        };

        res.write(`<p><h4>DoWrapUp is IN Progress, Please Do Not Close this Window!</h4></p><p> with request:<ul><li>conversationId: ${conversationId}</li><li>userid: ${userid}</li><li>wrapupcode: ${purecloudWrapupCode}</li></ul></p>`);


        axios.get(`https://api.mypurecloud.com.au/api/v2/conversations/calls/${conversationId}`, { headers })
        .then((response) => {
            console.log(`DOWRAPUP updatewrapup Genesys API GET CONVERSATION response data: ${JSON.stringify(response.data)}`);
            console.log(`DOWRAPUP updatewrapup Genesys API GET CONVERSATION response status: ${response.status}`);
            console.log(`DOWRAPUP updatewrapup Genesys API GET CONVERSATION response statusText: ${response.statusText}`);
            if(response.status==200){
                //get agent participantid
                var agent_participantid='';
                var agent_participantid_exist=false;
                var participants=Array.isArray(response.data.participants) ? response.data.participants :null;
                if(participants!=null)
                {
                    console.log(`DOWRAPUP updatewrapup Genesys API participants is an arrays with length: ${participants.length}`);
                    participants.forEach(function (participant) {
                        var purpose = participant.purpose;
                        var direction=participant.direction? participant.direction:'';
                        if(purpose=='agent'){
                                agent_participantid_exist=true;
                                //get userid
                                var participant_userid = participant.user ? participant.user.id :'';
                                if(participant_userid==userid)
                                {
                                    agent_participantid=participant.id;
                                    console.log(`DOWRAPUP updatewrapup Genesys API found agent participantid: ${agent_participantid} participant:agent`);
                                }
                        }
                        else if(purpose=='customer'){
                            casenumber = participant.attributes ? participant.attributes.CaseNumber ? participant.attributes.CaseNumber :'' : '';
                        }                    
                        else if(purpose=='user' && direction=='outbound'){
                            agent_participantid_exist=true;
                            //get userid
                            var participant_userid = participant.user ? participant.user.id :'';
                            if(participant_userid==userid)
                            {
                                agent_participantid=participant.id;
                                console.log(`DOWRAPUP updatewrapup Genesys API found agent participantid: ${agent_participantid} purpose:user, direction:outbound`);
                            }
                        }
                    });
                    if (agent_participantid!=''){
                        axios.patch(`https://api.mypurecloud.com.au/api/v2/conversations/calls/${conversationId}/participants/${agent_participantid}`, json, { headers })
                        .then(wrapupres => {
                            const wrapupResult = {status:`${wrapupres.status}`, statusText:`${wrapupres.statusText}`, casenumber: `${casenumber}`, conversationId: `${conversationId}`, agentid: `${agent_participantid}`, wrapupcode: `${purecloudWrapupCode}` };
                            console.log(`DOWRAPUP updatewrapup Genesys API PATCH WRAPUP - Status: ${wrapupres.status} statusText: ${wrapupres.statusText}  casenumber: ${casenumber}  conversationId: ${conversationId}  agentid: ${agent_participantid}  wrapupcode: ${purecloudWrapupCode}`);
                            res.end(`<br/><br/><hr><p>Wrapup is NOW completed, with result:<ul><li>status:${wrapupres.status} - ${wrapupres.statusText}</li><li>casenumber: ${casenumber}</li><li>conversationId: ${conversationId}</li><li>agent participant: ${agent_participantid}</li><li>wrapupcode: ${purecloudWrapupCode}</li></ul></p>`);
                        })
                        .catch(error =>{
                            console.log(error);
                            res.end(`<br/><br/><br/><hr><p><h2>RESULT: Internal Server Error.. >> Right Click on this Window and click "Reload".</h2></p>`);
                        });
                    }//if loop get participant with purpose agent MATCHED with userid
                    else{
                        //if found agent participantid but NOT MATCHED with userid sent from request
                        if(agent_participantid_exist){
                            const wrapupResult = {API_participant_status:`${response.status}`, API_participant_statusText: `${response.statusText}`, explaination:`UserID sent from Wrapup aws lambda ${userid} not matched with any participant with purpose agent Wrapup from Salesforce is unsuccesful, Please open Phone Widget and do wrapup from Phone to continue.`};
                            console.log('DOWRAPUP');
                            console.log(JSON.stringify(wrapupResult));
                            res.end(`<br/><br/><br/><hr><h3>Result: Internal Server Error ${response.status} - ${response.statusText} (userid sent from SF not matched with any participant)</h3><br/><h2>Right Click on this Window and click "Reload".</h2>`);
                        }
                        //if UNABLE found any participant with purpose agent
                        else{
                            const wrapupResult = {API_participant_status:`${response.status}`, API_participant_statusText: `${response.statusText}`, explaination:`ERROR array loop unable to get participant with purpose agent  Wrapup from Salesforce is unsuccesful, Please open Phone Widget and do wrapup from Phone to continue.`};
                            console.log('DOWRAPUP');
                            console.log(JSON.stringify(wrapupResult));
                            res.end(`<br/><br/><br/><hr><h3>Internal Server Error ${response.status} - ${response.statusText} (unable to get participant with purpose user)</h3><br/><h2>Right Click on this Window and click "Reload".</h2>`);
                        }
                    }
                }//if participants!=null
                else{
                    const wrapupResult = {API_participant_status:`${response.status}`, API_participant_statusText: `${response.statusText}`, explaination:`ERROR participants array is null unable to get any participant list from Genesys cloud API Wrapup from Salesforce is unsuccesful, Please open Phone Widget and do wrapup from Phone to continue.`};
                    console.log('DOWRAPUP');
                    console.log(JSON.stringify(wrapupResult));
                    //res.send(wrapupResult);
                    res.end(`<br/><br/><br/><hr><h3>Internal Server Error ${response.status} - ${response.statusText} (unable to get any particpant list from genesys cloud API)</h3><br/><h2>Right Click on this Window and click "Reload".</h2>`);
                }
            }//if response 200 to get agent participantid
            else{
                const wrapupResult = {API_participant_status:`${response.status}`, API_participant_statusText: `${response.statusText}`, explaination:`[Unable to get agent participantid], PLEASE RIGHT CLICK ON THIS WINDOW and CLICK "RELOAD"`};
                console.log(JSON.stringify(wrapupResult));
                res.end(`<br/><br/><br/><hr><h3>Internal Server Error ${response.status} - ${response.statusText} (unable to get participantid)</h3><br/><h2>Right Click on this Window and click "Reload".</h2>`);
            }
        })
        .catch(error =>{
            console.log('DOWRAPUP');
            console.log(error);
            res.end(`<br/><br/><br/><hr><p><h2>RESULT: Internal Server Error.. >> Right Click on this Window and click "Reload".</h2></p>`);
        });

    });
}



var httpServer = http.createServer(app);

//USE THIS LOCAL
//httpServer.listen(PORT);
//USE THIS in AWS
module.exports.handler = serverless(app);



function getFormattedUrl(req) {
    return url.format({
        protocol: req.protocol,
        host: req.get('host')
})}