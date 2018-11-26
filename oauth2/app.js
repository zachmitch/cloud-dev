/* Author:  Zach Mitchell, mitcheza@oregonstate.edu
   CS493, FALL 2018 - HW6 OAUTH2.0
   11/8/2018
*/


//Necesseties for Node / Project
const express = require('express');
var request = require('request');
const app = express();

const bodyParser = require('body-parser');

const projectId = 'mitcheza-oauth2';

const router = express.Router();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));

app.use('/', router);
app.use(express.static(__dirname));

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
   console.log(`Server listening on port ${PORT}...`);
});



var state;  //randomly generated state
var toke; // Goog+ access token


//Index page
router.get('/', function(req, res){
  res.sendFile(__dirname + "/index.html");
});


//Has user confirm with Goog+ that all is well
router.get('/login', function(req, res){
            var gAuthURL = "https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=281556035711-180g01hjn14m9lrlcet4rjnr3en3oh98.apps.googleusercontent.com&redirect_uri=https://mitcheza-oauth2.appspot.com/auth&scope=email&state=";

            //**************STATE GENERATION*********************/
            //Make a random string for state
            //http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript
            state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);


            gAuthURL += state;
            res.redirect(gAuthURL);
});

//Get access token from Goog+
router.get('/auth', function(req, res){
    var authState = req.query.state;
    var  authCode = req.query.code;

    //**************STATE VERIFICATION*********************/
    //Check if google supplies the random state and that request params are as expected
    if (authState === 'undefined' || authCode === 'undefined' || authState != state) {
      res.status(400).send("Something went wrong.");
    }

    //build post request for Google
    var googApi = "https://www.googleapis.com/oauth2/v4/token?";
    googApi +=  "code=" + authCode;
    googApi += "&client_id=281556035711-180g01hjn14m9lrlcet4rjnr3en3oh98.apps.googleusercontent.com";
    googApi += "&client_secret=mEobJLdukD9KWI5S2whPYvsM";
    googApi += "&redirect_uri=https://mitcheza-oauth2.appspot.com/auth";
    googApi += "&grant_type=authorization_code";

    console.log("googAPI");
    console.log(googApi);

    //Get the access token from Goog+
    request({
      url: googApi,
      method: 'POST'
    }, function(error, response, body){
        var resBody = JSON.parse(body);
        toke = resBody.access_token;
        //Get user info from Goog+
        request({
          url: "https://www.googleapis.com/plus/v1/people/me",
          method: 'GET',
          headers: {
            "Authorization": "Bearer " + toke
          }
        }, function(er, rs, bd){
            var final = JSON.parse(bd);
            var fName = final.name.givenName;
            var lName = final.name.familyName;
            var usr_url = final.url;

            var rez_string = "<h1><ul><li>First Name: " + fName + "</li>";
            rez_string += "<li> Last Name: " + lName + "</li>";
            rez_string += "<li> Url: " + usr_url + "</li></ul></h1>";

            res.send(rez_string);
        });
    });
});
