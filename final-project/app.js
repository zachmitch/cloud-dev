/* Author:  Zach Mitchell, mitcheza@oregonstate.edu
   CS493, FALL 2018 - FINAL PROJECT, ART MUSEUM COLLECTION API
   11/28/2018
*/

//Necesseties for Node / Project
const express = require('express');
const app = express();

const Datastore = require('@google-cloud/datastore');
const bodyParser = require('body-parser');

const projectId = 'mitcheza-api-2';
const datastore = new Datastore({projectId:projectId});

const router = express.Router();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));

const request = require('request');

const jwt = require('express-jwt');
const jwksRSA = require('jwks-rsa');

//Kinds in the Datastore
const WORK = "Artwork";
const ARTIST = "Artist";

app.use('/', router);

//Every function that goes to router checks for accept application/json
router.use( function(req,res,next){
    acceptsJSON(req,res, next);
});

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
   console.log(`Server listening on port ${PORT}...`);
});

/*--------Helper functions ---------------------*/

//Return the item/key data w/id
function addIDandSelfLink(req, item){
            item.id = item[Datastore.KEY].id;
            item.self = "https://" + req.get("host") + req.route.path + "/"+ item.id;
            return item;
}

//Return 406 error if request doesn't accept json
function acceptsJSON(req, res, next){
  let reqAccepts = req.get('accept');    //Get what user accepts
  let acceptable = 'application/json';    // and compare to what is acceptable
  let acceptableRequest = (reqAccepts === acceptable);
  if(!acceptableRequest){
    res.status(406).send('Must explicity accept "application/json"');
  } else {
    next();
  }
}

//Get total # of kind for all of entity type
async function getTotal(items, kind){
  var q = datastore.createQuery(kind);
  await datastore.runQuery(q).then(entities =>{
    items.total = entities[0].length;
  });
  return items;
}

//Clear artwork from artist
//If we delete an artwork, we must remove it from artist's works
async function clearWork(req, artwork){

  await get_artist(req, artwork.artist.id).then((a)=>{
    for( var i = 0; i < a.works.length; i++){
        console.log(a.works[i].id);
       if ( a.works[i].id === artwork.id) {
         a.works.splice(i, 1);
         break;
       }
    }
    console.log(a.works);
    //Edit artist
    edit_artist(a.id, a.name, a.nationality, a.style, a.works);
  });


}
//Clear artist from artwork
//If we delete an artist, we must remove their name from a work
async function clearArtistWorks(req, artist){
  const workSz = artist.works.length;

  //Cycle through each artwork and remove artist name from work
  for(var j = 0; j < workSz; j++){
    await get_work(req, artist.works[j].id).then((work)=>{
      edit_work(work.id, work.name, work.year, work.location, "", req.user.name);
    });
  }
}

//Check jwt
const checkJwt = jwt({
    secret: jwksRSA.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `https://mitcheza.auth0.com/.well-known/jwks.json`
    }),
    // Validate the audience and the issuer.
    issuer: `https://mitcheza.auth0.com/`,
    algorithms: ['RS256']
  });


//Get Access token
async function getAccessToken(accTok){

  var options = { method: 'POST',
  url: 'https://mitcheza.auth0.com/oauth/token',
  headers: { 'content-type': 'application/json' },
  body:
   { grant_type: 'client_credentials',
     client_id: 'xR5lnnDhigcz16lOeZomfJk0vw5Rhfap',
     client_secret: '2es-g-acKHw8rNrbujWV3Xl5FPsWQEy4ygWAyt50F1fY1Ua-DX1pewtF6IWenHyT',
     audience: 'https://mitcheza.auth0.com/api/v2/' },
  json: true };


  return new Promise(resolve =>{


    request(options, function (error, response, body) {
      resolve(body);
   })
 }).then(val =>{
   accTok = val;
   return accTok;
 });


}


/*--------End Helper functions ---------------------*/


/* ------------- ARTWORK Model Functions ------------- */

// Return all artworks
function get_works(req){
        var q = datastore.createQuery(WORK).limit(5);
        var results = {}; //returned to user
        if(Object.keys(req.query).includes("cursor")){ //If there is a cursor
          q.startVal = (req.query.cursor).replace(/ /g, "+"); //Set start of retrieval at cursor in URI format
        }
        // console.log("QUERY");
        // console.log(q);

        //Retrieve works from datastore
        return datastore.runQuery(q).then( entities => {
          results.works = entities[0];

          //Add next if necessary
          if(entities[1].moreResults !== Datastore.NO_MORE_RESULTS){
            results.next = "https://" + req.get("host") + "/works?cursor=" + entities[1].endCursor;
          }

          //Add ID's and selfLinks
          results.works.map( function(x){
            return addIDandSelfLink(req,x);
          });

          //Add total
          return getTotal(results, WORK);

        }).catch( errr => {
            console.log(errr);
            return false;
        });
}

//Return a single artwork
function get_work(req, id){
        console.log("INSIDE GET_WORK");
        const key = datastore.key([WORK, parseInt(id,10)]);
        return datastore.get(key).then( result => {
            var work = result[0];
            req.route.path = "/works";  //Confirm path is set for selflink
            addIDandSelfLink(req, work);
            console.log("EXITING GET_WORK");
            return work;

        }).catch( err => {
            return false;
        });
}

//Add a new artwork
function new_work(name, year, location, owner){
        var key = datastore.key(WORK);
        const new_art = { "name": name, "year": year, "location": location, "artist":"", "owner": owner};
        return datastore.save({"key":key, "data":new_art}).then(() => {
          return key;

        }).catch( err => {
            return false;
        });
}



// Edit an artwork
function edit_work(id, name, year, location, artist, owner){

        const key = datastore.key([WORK, parseInt(id,10)]);

        const work = {"name": name, "year": year, "location": location, "artist": artist, "owner": owner};

        console.log("returning: ");
        console.log("datastore.save()");

        return datastore.save({"key":key, "data":work})

        .catch( err => {
            return false;
        });
}

//Remove artwork from datastore
function delete_work(id){
        console.log("INSIDE DELETE_WORK");
        const key = datastore.key([WORK, parseInt(id,10)]);
        return datastore.get(key).then( result => {

          //Delete the artwork
          return datastore.delete(key).then(()=>{
            console.log("EXITING DELETE WORK");
            return true;
          });
        }).catch( err => {
            return false;
        });
}

/* ------------- End ARTWORK Functions ------------- */

/* ------------- Begin ARTIST Model Functions ------------- */

// Return all artists
function get_artists(req){
        var q = datastore.createQuery(ARTIST).limit(5);
        var results = {}; //returned to user
        if(Object.keys(req.query).includes("cursor")){ //If there is a cursor
          q.startVal = (req.query.cursor).replace(/ /g, "+"); //Set start of retrieval at cursor in URI format
        }
        // console.log("QUERY");
        // console.log(q);

        //Retrieve artists from datastore
        return datastore.runQuery(q).then( entities => {
          results.artists = entities[0];

          //Add next if necessary
          console.log("CURSOR");
          console.log(entities[1]);
          if(entities[1].moreResults !== Datastore.NO_MORE_RESULTS){
            results.next = "https://" + req.get("host") + "/artists?cursor=" + entities[1].endCursor;
          }

          //Add ID's and selfLinks
          results.artists.map( function(x){
            return addIDandSelfLink(req,x);
          });

          //Add total
          return getTotal(results, ARTIST);


        }).catch( err => {
          console.log("ERR");
          console.log(err);
            return false;
        });
}

//Return a single artist
function get_artist(req, id){
        console.log("inside get_artist: " + id);
        const key = datastore.key([ARTIST, parseInt(id,10)]);
        return datastore.get(key).then( result => {
            var artist = result[0];
            req.route.path = "/artists";  //Confirm path is set for selflink
            addIDandSelfLink(req, artist);
            console.log("exiting get_artist: ");
            return artist;
        }).catch( err => {
          console.log("ERR GET ARTIST");
            return false;
        });
}


//Add new artist
function new_artist(name, nationality, style){
        var key = datastore.key(ARTIST);
        const new_a = { "name": name, "nationality": nationality, "style": style,
            "works": []};
        return datastore.save({"key":key, "data":new_a}).then(() => {
          return key;

        }).catch( err => {
             return false;
         });
}

// Edit artist
function edit_artist(id, name, nationality, style, works){
      const key = datastore.key([ARTIST, parseInt(id,10)]);

      const artist = {"name": name, "nationality": nationality, "style": style, "works": works};

      console.log("returning: ");
      console.log("datastore.save() " + name);

      return datastore.save({"key":key, "data":artist})

      .catch( err => {
          return false;
      });
}

//Remove artist from datastore
function delete_artist(id){
      console.log("INSIDE DELETE_ARTIST");

        const key = datastore.key([ARTIST, parseInt(id,10)]);

        return datastore.get(key).then( result => {
          console.log("EXITING DELETE_ARTIST");

          //Delete the artist
          return datastore.delete(key);
        }).catch( err => {
            return false;
        });
}

/* ------------- End ARTIST Functions ------------- */



/***************** BEGIN ROUTER / CONTROLLER FUNCTIONS BASED ON URL ********************/



/* ------------- Begin ARTWORK Controller Functions ------------- */
//Get all artworks
router.get('/works', checkJwt,function(req, res){

            return get_works(req)  // Get all works
            .then( (works) => {
              console.log(works);
              res.status(200).json(works); //Return the goodies
            });
});

//Get a single artwork
router.get('/works/:id', checkJwt,function(req, res){
            var id = req.params.id;
            var work = get_work(req, id)
            .then( (work) => {
                if(work){    //If exists, send back the goodies
                    //Unauthorized if they don't match
                    if(work.owner !== req.user.name){
                      res.status(403).end();
                    } else{
                      res.status(200).json(work);
                    }
                } else {
                  res.status(404).end();   //Send error if not found
                }
            });
});

// Add a new artwork
router.post('/works', checkJwt, function(req, res){
            //If user didn't fill out all properties
            if(typeof (req.body.name) != 'string' ||
               typeof (req.body.year) != 'number' ||
               typeof (req.body.location) != 'string'){

              res.status(400).send("ERROR.  Confirm all parameters are initialized correctly.").end()
            } else {
              //All properties initialized, add to datastore
               return new_work(req.body.name, req.body.year, req.body.location, req.user.name)
               .then( key => {res.status(201).send('{ "id": ' + '"' + key.id + '" }')} );
            }
});



// Edit an artwork
router.put('/works/:id', checkJwt,function(req, res){
            //If user didn't fill out all properties
            if(typeof (req.body.name) != 'string' ||
               typeof (req.body.year) != 'number' ||
               typeof (req.body.location) != 'string'){
              res.status(400).send("ERROR.  Confirm all parameters are initialized correctly.").end();
              return;
            } else {

              // See if artwork exists in datastore to edit
              return get_work(req, req.params.id).then( workExists =>{
                if(workExists){

                  if(workExists.owner !== req.user.name){
                    res.status(403).end();
                  } else{
                    //Edit work, then send success message
                    edit_work(req.params.id, req.body.name, req.body.year, req.body.location, workExists.artist, req.user.name)
                    .then(res.status(200).end());
                  }



                } else {
                  //work doesn't exist
                  res.status(404).end();
                }
              });
           }
});

//Try to edit all artwork - error
router.put('/works', function(req, res){
  res.set('Accept', 'GET, POST');
  res.status(405).send("Can't edit ALL artwork.");
});


//Delete artwork
router.delete('/works/:id', checkJwt, function(req, res){
            //See if artwork exists
            console.log("**************DELETING A WORK*************************");
            return get_work(req,req.params.id).then( workExists => {

              //if so clear from artist's set of works
              if(workExists){

                if(workExists.owner !== req.user.name){
                  res.status(403).end();
                }else {
                  //Clear it from artist's works
                  clearWork(req, workExists).then(()=>{

                    delete_work(req.params.id).then(()=>{
                      console.log("SENDING 204, SUCCESSFUL DELETE");

                        res.status(204).end();

                    });

                  });
                }

              } else {
                res.status(404).end();  //Ship not found
              }
          });
});

//Try to delete all artwork - error
router.delete('/works', function(req, res){
  res.set('Accept', 'GET, POST');
  res.status(405).send("Can't delete ALL artwork.");
});


/* ------------- End ARTWORK Controller Functions ------------- */

/* ------------- Begin ARTIST Controller Functions ------------- */

//Get all artists
router.get('/artists', function(req, res){

      return get_artists(req)  // Get all artists
      .then( (artists) => {
          console.log("SENDING BACK");
          console.log(artists);
          res.status(200).json(artists); //Return the goodies

      });

});

//Get a single artist
router.get('/artists/:id', function(req, res){
          var id = req.params.id;
          var artist = get_artist(req, id)
          .then( (artist) => {
              if(artist){    //If exists, send back the goodies
                  res.status(200).json(artist);
              } else {
                res.status(404).end();   //Send error if not found
              }
          });
});

// Add new artist
router.post('/artists', function(req, res){
            //If user didn't fill out all properties
            if(typeof (req.body.name) != 'string' ||
               typeof (req.body.nationality) != 'string' ||
               typeof (req.body.style) != 'string'){
              res.status(400).send("ERROR.  Confirm all parameters are initialized correctly.").end();
            } else {
              //All properties initialized, add to datastore
               new_artist(req.body.name, req.body.nationality, req.body.style)
               .then( key => {res.status(201).send('{ "id": ' + '"' + key.id + '" }')} );
            }
});

//Edit existing artist
router.put('/artists/:id', function(req, res){

    //See if artist exists
    return get_artist(req, req.params.id).then( artistExists =>{

        if(artistExists){
            //Confirm user passed number in correct form
            if(typeof (req.body.name) != 'string' ||
               typeof (req.body.nationality) != 'string' ||
               typeof (req.body.style) != 'string'){
              res.status(400).send("ERROR.  Confirm all parameters are initialized correctly.").end();
              return;
            }
            console.log("ARTIST EXISTS");

              //Supply edit
              edit_artist(req.params.id,req.body.name, req.body.nationality, req.body.style, artistExists.works).then(res.status(200).end());

          } else { // Artist doesn't exist
            res.status(404).end();
          }
      }); //Return get artist
});

//Try to edit all artists - error
router.put('/artists', function(req, res){
  res.set('Accept', 'GET, POST');
  res.status(405).send("Can't edit ALL artists.");
});

//Delete artist
router.delete('/artists/:id', function(req, res){
        var artist; //Holds artist to delete
        //See if artist exists
        return get_artist(req, req.params.id).then( exists => {
            if(exists){

              artist = exists; //Returns artist object

              //Clear works of artist if necessary
              if (artist.works.length !== 0){

                return clearArtistWorks(req, artist).then((nada)=>{
                  console.log("DELETING ARTIST");
                  delete_artist(req.params.id).then(res.status(204).end());
                });

              } else { // artist was not on a ship
                delete_artist(req.params.id).then(res.status(204).end());
              }
            } else { //artist doesn't exist
              res.status(404).end();
            }
        });
});


//Try to delete all artists - error
router.delete('/artists', function(req, res){
  console.log("in delete all artists")
  res.set('Accept', 'GET, POST');
  res.status(405).send("Can't delete ALL artists.");
});

/* ------------- End ARTIST Controller Functions ------------- */


/* ------------- Begin ARTIST / Artwork relationship Controller Functions ------------- */

//Assign Artwork to an Artist
router.put('/artists/:artist_id/works/:work_id', checkJwt,function(req, res){

      var artist; //Holds artist info, if it exists


      //Confirm that both artist/artwork exist
      return get_artist(req, req.params.artist_id).then( artistExists =>{
          //get_artist() returns artist object if it exists, false if not
          if(artistExists){
            artist = artistExists;

            // Check artwork exists
            return get_work(req, req.params.work_id).then( workExists => {

                //Returns work object if exists, check to see if it's already attached to an artist
                if(workExists){ // Here we know both artist/artwork exist

                  //  if work is not attached to an artist, assign it, otherwise send forbidden 403
                  if(workExists.artist === ""){

                        if(workExists.owner !== req.user.name){
                          res.status(403).end();
                        } else {
                          var a = {};
                          a.name = artist.name;
                          a.id = artist.id;
                          a.self = artist.self;

                          //Assign artist to work
                            return edit_work(workExists.id, workExists.name,
                              workExists.year, workExists.location, a, req.user.name).then( nothing =>{
                               //Add work to artist
                               var artwork = {};
                               artwork.name = workExists.name;
                               artwork.id = workExists.id;
                               artwork.self = workExists.self;
                               artist.works.push(artwork);

                               //Edit artist
                               return edit_artist(artist.id, artist.name, artist.nationality,
                                 artist.style, artist.works);

                         }).then(()=>{

                            console.log("SENDING LOADED SUCCESS 200")
                           res.status(200).end()}); //Send success
                        }

                  } else { // Artwork already assigned to an artist, forbidden
                    res.status(403).end();
                    return;
                  }

                } else { // Artwork doesn't exist
                  res.status(404).end();
                  return;
                }

            });
          } else { // Artist doesn't exist
            res.status(404).end();
            return;
          }
      });
});


//Remove artwork from artist
router.delete('/artists/:artist_id/works/:work_id', checkJwt, function(req, res){
    //Confirm that both artist/artwork exist
    var artist; //Holds artist info, if it exists
    console.log("ENTERING UNLOAD WORK");

    //Confirm that both artist/artwork exist
    return get_artist(req, req.params.artist_id).then( artistExists =>{
        //get_artist returns artist object if it exists, false if not
        if(artistExists){
          artist = artistExists;

          // Check artwork exists
          return get_work(req, req.params.work_id).then( workExists => {

              //Returns artwork object if exists
              if(workExists){ // Here we know both artist/artwork exist



                  //Confirm that artist we are removing matches artwork.artist, else bad request
                  if(workExists.artist.id !== artist.id){
                    console.log("ARtists name");
                    res.status(400).end(); //Bad request
                  } else if (workExists.owner !== req.user.name){
                     res.status(403).end(); // Forbidden
                  }  else {
                    workExists.artist = "";

                    //Confirm that artist made that work
                    let didCreate = false; // Bool to see if artist created work
                    for( var i = 0; i < artist.works.length; i++){
                      console.log(artist.works[i].name);
                       if ( artist.works[i].name === workExists.name) {
                         artist.works.splice(i, 1);
                         didCreate = true;
                       }
                    }

                    if(!didCreate){
                      res.status(400).end(); //Bad request, artist didnt make that
                    }

                    //Make edits to work and artist
                    edit_artist(artist.id, artist.name, artist.nationality, artist.style, artist.works)
                    .then(edit_work(workExists.id, workExists.name, workExists.year, workExists.location, workExists.artist, req.user.name))
                    .then(res.status(200).end());
                  }

              } else { // Artwork doesn't exist
                res.status(404).end();
              }
          });
        } else { // Artist doesn't exist
          res.status(404).end();
        }
    });

});
/* ------------- End ARTIST / Artwork relationship Controller Functions ------------- */

/* ------------- BEGIN User functions ------------- */

//Login
router.post('/login', function(req, res){
  const username = req.body.username;
  const password = req.body.password;
  var options = { method: 'POST',
    url: 'https://mitcheza.auth0.com/oauth/token',
    headers: { 'content-type': 'application/json' },
    body:
     { scope: 'openid',
       grant_type: 'password',
       username: username,
       password: password,
       client_id: 'mx0zGg07VIRXTFVLPu2LCJcfXgX5Bng6',
       client_secret: 'p308vHYZC1bc2KqgQcQbgNejYVgD2JZZ923Lc058XulP8vwmcmba9JEM75O1FXst' },
    json: true };
    request(options, (error, response, body) => {
        if (error){
            res.status(500).send(error);
        } else {
            res.send(body);
        }
    });

});

// New User
router.post('/newuser', async function(req, res){
  const username = req.body.username;
  const password = req.body.password;
  var accTok;

  console.log("username: " + username);
  console.log("password: " + password);


    //Get access token so we are allowed to create new account
    await getAccessToken(accTok)
    .then((accessToken)=>{

      //Bearer token
      var btoke = "Bearer " + accessToken.access_token;

      //Setup call with token to create a new account
      var options = {

      method: 'POST',
      url: 'https://mitcheza.auth0.com/api/v2/users',
      headers: { authorization: btoke,
        'content-type': 'application/json' },
      body:
      {
        email: username,
        password: password,
        connection: "Username-Password-Authentication"
      },
      json: true };

      request(options, function (error, response, body) {

        res.status(201).send(username + " account created!");

      });
    });

});


/* ------------- END User function ------------- */
