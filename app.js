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



const authvalidation = function(req, res, next) {

    console.log(`@@ it hit authvalidation with url:   \n[${req.method} ${req.url}] `);

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


        console.log('sessionMap[req.cookies.session] '+sessionMap[req.cookies.session]);
        console.log(' req.url.indexOf(oauth) == -1: '+ req.url.indexOf('oauth') == -1);

        origURL=req.url;
        var originloc =getFormattedUrl(req);
        console.log('authvalidation origURL: '+origURL +' originloc: '+originloc);

        console.log(`${req.uri}`);

        //redirect the user to authorize with Genesys Cloud
        //var redirectUri='https://login.mypurecloud.com.au/oauth/authorize?response_type=code&client_id='+clientId+'&redirect_uri=http://localhost:8085/oauth2/callback';
        var redirectUri=`https://login.mypurecloud.com.au/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${originloc}/prod/oauth2/callback`;
        res.redirect(redirectUri);

        return;
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
        console.log(`oauth callback @@ origURl:  ${originloc}/prod${origURL}`);
        res.redirect(`${originloc}/prod${origURL}`);
    })
    .catch(e => console.error(e));
});


app.get('/', function(req, res){
    console.log(`@@!! it hit / with url:   ${req.method}   ${req.url}`);
    var originloc =getFormattedUrl(req);
    console.log(`@@!! it hit / with url:   ${originloc}`);
    res.render(`${originloc}/prod/info.html`);
})






app.get('/me', function(req, res){
    console.log(`@@ it hit /me with url:   ${req.method}   ${req.url}`);
    // Get the session from map using the cookie
    const oauthId = sessionMap[req.cookies.session];

    axios({
        url: `https://api.${environment}/api/v2/users/me`,
        method: 'get',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${oauthId}`
        }
    })
    .then(response => {
        const user = response.data;
        console.log('Got response for /users/me');
        console.log(user);
        res.send(user);
    })
    .catch(e => console.error(e));
});


app.get('/updatewrapup/:conversationId&:purecloudWrapupCode', function(req, res){

    console.log(`@@ it hit /updatewrapup/:conversationId&:purecloudWrapupCode with url:   ${req.method}   ${req.url}`);
    const oauthId = sessionMap[req.cookies.session];
    console.log(`updatewrapup Genesys Cloud BearerToken: ${oauthId}`);

    var conversationId= req.params.conversationId;
    var purecloudWrapupCode=req.params.purecloudWrapupCode;
    var wrapupResult='Redeeming single flight credit';

    console.log(`updatewrapup conversationId: ${conversationId}`);
    console.log(`updatewrapup purecloudWrapupCode: ${purecloudWrapupCode}`);

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

    axios.get(`https://api.mypurecloud.com.au/api/v2/conversations/calls/${conversationId}`, { headers })
    .then((response) => {
        console.log(`updatewrapup Genesys API GET CONVERSATION response data: ${JSON.stringify(response.data)}`);
        console.log(`updatewrapup Genesys API GET CONVERSATION response status: ${response.status}`);
        console.log(`updatewrapup Genesys API GET CONVERSATION response statusText: ${response.statusText}`);
        if(response.status==200){
            //get agent participantid
            var agent_participantid='';
            var participants=Array.isArray(response.data.participants) ? response.data.participants :null;
            if(participants!=null)
            {
                console.log(`updatewrapup Genesys API participants is an arrays with length: ${participants.length}`);
                participants.forEach(function (participant) {
                    var purpose = participant.purpose;
                    if(purpose=='agent'){
                            agent_participantid=participant.id;
                            console.log(`updatewrapup Genesys API found agent participantid: ${agent_participantid}`);
                    }
                });
                if (agent_participantid!=''){
                    axios.patch(`https://api.mypurecloud.com.au/api/v2/conversations/calls/${conversationId}/participants/${agent_participantid}`, json, { headers })
                    .then(wrapupres => {
                        const wrapupResult = {status:`${wrapupres.status}`, statusText:`${wrapupres.statusText}`};
                        console.log(`updatewrapup Genesys API PATCH WRAPUP - Status: ${wrapupres.status} statusText: ${wrapupres.statusText}`);
                        res.send(wrapupResult);
                    })
                    .catch(e => console.error(e));
                }//if loop get get participant with purpose agent
                else{
                    const wrapupResult = {API_participant_status:`${response.status}`, API_participant_statusText: `${response.statusText}`, explaination:`ERROR array loop unable to get participant with purpose agent`};
                    console.log(JSON.stringify(wrapupResult));
                    res.send(wrapupResult);
                }
            }//if participants!=null
            else{
                const wrapupResult = {API_participant_status:`${response.status}`, API_participant_statusText: `${response.statusText}`, explaination:`ERROR participants array is null unable to get agent participantid`};
                console.log(JSON.stringify(wrapupResult));
                res.send(wrapupResult);
            }
        }//if response 200 to get agent participantid
        else{
            const wrapupResult = {API_participant_status:`${response.status}`, API_participant_statusText: `${response.statusText}`, explaination:`ERROR Genesys API to get agent participant is not return 200`};
            console.log(JSON.stringify(wrapupResult));
            res.send(wrapupResult);
        }
    });
});




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