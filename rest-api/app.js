


//Necesseties for Node / Project
const express = require('express');
const app = express();

const Datastore = require('@google-cloud/datastore');
const bodyParser = require('body-parser');

const projectId = 'mitcheza-api';
const datastore = new Datastore({projectId:projectId});

const router = express.Router();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));

//Additional functions for hw3
//const helper = require('./helper_functions');

//Kinds in the Datastore
const SHIP = "Ship";
const SLIP = "Slip";

app.use('/', router);

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
   console.log(`Server listening on port ${PORT}...`);
});

/*--------Helper functions ---------------------*/

//Return the item/key data
function fromDatastore(item){
            item.id = item[Datastore.KEY].id;
            return item;
}


// Clears a slip if it contains name passed
// If ship was in a slip, return true, else false
function emptySlip(name){
  const q = datastore.createQuery(SLIP);
  return datastore.runQuery(q).then( (entities) => {
          var slips = entities[0]; // All slips
          var slip = ""; // Where ship is parked
          var slipsLen = slips.length;
          //Iterate and see if ship is in a slip / or at sea
          for(var i = 0; i < slipsLen; i++){
            if (slips[i].current_ship == name){
              slip = slips[i];
              fromDatastore(slip);
            }
          }
          //If ship was parked, edit values of slip
          if(slip != "") {
             put_slip(slip.id, slip.number, "", "").then(resp =>{
              return true;
            });
          }
          return false;
  });
}

/*--------End Helper functions ---------------------*/


/* ------------- Ship Model Functions ------------- */

// Return all ships
function get_ships(){
        const q = datastore.createQuery(SHIP).order('name');
        return datastore.runQuery(q).then( (entities) => {
                return entities[0].map(fromDatastore);
        });
}

//Return a single ship
function get_ship(id){
        const key = datastore.key([SHIP, parseInt(id,10)]);
        return datastore.get(key).then( result => {

            var ship = result[0];
            ship.id = id;
            return ship;

        }).catch( err => {
            return false;
        });
}

//Add a new ship
function post_ship(name, type, length){
        var key = datastore.key(SHIP);
        const new_ship = { "name": name, "type": type, "length": length};
        return datastore.save({"key":key, "data":new_ship}).then(() => {return key});
}



// Edit a ship
function put_ship(id, name, type, length){
        const key = datastore.key([SHIP, parseInt(id,10)]);
        const ship = {"name": name, "type": type, "length": length};
        return datastore.save({"key":key, "data":ship})
        .catch( err => {
            return false;
        });
}

//Remove ship from datastore
function delete_ship(id){
        const key = datastore.key([SHIP, parseInt(id,10)]);
        return datastore.get(key).then( result => {
          //Get the ship name to clear it from slip
            var ship = result[0];
            return ship.name;
        }).then(name => {
          //Clears slip if it contained deleted ship
            emptySlip(name)
        }).then( resp =>{
          //Delete the ship
          return datastore.delete(key);
        });
}

/* ------------- End Ship Functions ------------- */


/* ------------- Slip Model Functions ------------- */

//Add a new slip
function post_slip(num){
        var key = datastore.key(SLIP);
        const new_slip = { "number": num, "current_ship": '', "arrival_date": ''};
        return datastore.save({"key":key, "data":new_slip}).then(() => {return key});
}

// Return all slips
function get_slips(){

    var outSlips; // holds final array of slips output
    var outShips; // all ships returned from get_ships()

    const q = datastore.createQuery(SLIP).order('number');
    return datastore.runQuery(q).then( (entities) => {
            var slips = entities[0].map(fromDatastore);
            outSlips = slips;
            return slips;

    }).then( slips => {

      return get_ships()

    }).then(  ships => {  //Iterate through ships to find id for URL

        outShips = ships;

        //Nested for loop lengths
        var slipsLen = outSlips.length;
        var shipsLen = outShips.length;

        // O(n^2) implementation, *re-check for improvement
        for (var i = 0; i < slipsLen; i++){
            //If the slip has a ship in it
            if(outSlips[i].current_ship != ""){
                //Find that ship id, place in a url and add to object
                for(var j = 0; j < shipsLen; j++){
                    if(outSlips[i].current_ship == outShips[j].name){
                      fromDatastore(outShips[j]);
                      outSlips[i].ship_url = "https://mitcheza-api.appspot.com/ships/" + outShips[j].id;
                    }
                }
                //If no ship resides in slip, empty url
            } else {
                outSlips[i].ship_url = "";
            }
        }
        return outSlips;
      });
}

//Return a single slip
function get_slip(id){

  var outSlip;  //holds Final slip output by api

  const key = datastore.key([SLIP, parseInt(id,10)]); //First grab slip from id
  return datastore.get(key).then( result => {
          const entity = result[0];
          return entity;
  }).then( slip=> {

          outSlip = slip;
          outSlip.ship_url = "";

          if(slip.current_ship != ""){  // If slip has ship, retrieve all ships

            return get_ships().then(ships => {  //Iterate through ships to find id for URL
                var shipsLen = ships.length;
                for (var i = 0; i < shipsLen; i++){
                  if(outSlip.current_ship == ships[i].name){
                    fromDatastore(ships[i]);
                    outSlip.ship_url = "https://mitcheza-api.com/ships/" + ships[i].id;
                  }
                }
                return outSlip;  //Returns slip with a ship
            });
          }

          return outSlip;  //Returns slip without a ship
  }).catch( err => {
      return false;
  });
}

// Edit a slip
function put_slip(id, number, current_ship, arrival_date){
        const key = datastore.key([SLIP, parseInt(id,10)]);
        const slip = {"number": number, "current_ship": current_ship, "arrival_date": arrival_date};
        return datastore.save({"key":key, "data":slip})
        .catch( err => {
            return false;
        });
}

//Remove slip
function delete_slip(id){
        const key = datastore.key([SLIP, parseInt(id,10)]);
        return datastore.delete(key);
}

/* ------------- End Slip Functions ------------- */






/***************** BEGIN ROUTER / CONTROLLER FUNCTIONS BASED ON URL ********************/







/* ------------- Begin Ship Controller Functions ------------- */
//Get all ships
router.get('/ships', function(req, res){
            const ships = get_ships()
            .then( (ships) => {
                res.status(200).json(ships);
            });
});

//Get a single ship
router.get('/ships/:id', function(req, res){
            const ship = get_ship(req.params.id)
            .then( (ship) => {
              //Send error if not found
                if(ship){
                  res.status(200).json(ship);
                } else {
                  res.status(404).end();
                }
            });
});

// Add a new ship
router.post('/ships', function(req, res){
            //If user didn't fill out all properties
            if(typeof (req.body.name) != 'string' ||
               typeof (req.body.type) != 'string' ||
               typeof (req.body.length) != 'number'){
              res.status(400).send("ERROR.  Confirm all parameters are initialized correctly.").end()
            } else {
              //All properties initialized, add to datastore
               post_ship(req.body.name, req.body.type, req.body.length)
               .then( key => {res.status(201).send('"id": ' + '"' + key.id + '"')} );
            }
});

// Edit a ship
router.put('/ships/:id', function(req, res){
            //If user didn't fill out all properties
            if(typeof (req.body.name) != 'string' ||
               typeof (req.body.type) != 'string' ||
               typeof (req.body.length) != 'number'){
              res.status(400).send("ERROR.  Confirm all parameters are initialized correctly.").end()
            } else {
              // See if ship exists in datastore to edit
              return get_ship(req.params.id).then( exists =>{

                if(exists){
                  //Edit ship, then send success message
                  put_ship(req.params.id, req.body.name, req.body.type, req.body.length)
                  .then(res.status(200).end());

                } else {
                  //Send not found if it doesn't exist
                  res.status(404).end();
                }

              });
            }
});

//Delete a ship
router.delete('/ships/:id', function(req, res){
            //See if ship exists
            return get_ship(req.params.id).then( exists => {
              //if so perform delete, else send back not found
              if(exists){
                delete_ship(req.params.id).then(res.status(204).end());
              } else {
                res.status(404).end();
              }
          });
});

/* ------------- End Ship Controller Functions ------------- */

/* ------------- Begin Slip Controller Functions ------------- */

//Get all slips
router.get('/slips', function(req, res){
            const slips = get_slips()
            .then( (slips) => {
                res.status(200).json(slips);
            });
});

//Get single slip
router.get('/slips/:id', function(req, res){
            return get_slip(req.params.id)
            .then( (slip) => {
                //If slip not found send error
                if(slip){
                  res.status(200).json(slip);
                } else {
                  res.status(404).end();
                }
            });
});

// Make new slip
router.post('/slips', function(req, res){

          //Confirm a number for slip is passed correctly
          if(typeof (req.body.number) != 'number'){
            res.status(400).send("ERROR.  Confirm all parameters are initialized correctly.").end()
            return;
          }

          //See if slip number already exists
          return get_slips().then( slips => {
              var slipsLen = slips.length;
              var unique = true;
              for(var i = 0; i < slipsLen; i++){
                  if(req.body.number == slips[i].number)
                    unique = false;
              }
              //Add slip if number doesn't already exist or send back error
              if(unique){
                post_slip(req.body.number)
                .then( key => {
                  res.status(201).send('{ "id": ' + key.id + ' }')
                });
              } else {
                  res.status(409).end(); //409, already exists
              }

          })
});

//Edit existing slip
router.put('/slips/:id', function(req, res){

    //See if slip exists
    return get_slip(req.params.id).then( exists =>{

        if(exists){
            //Confirm user passed number in correct form
            if( typeof(req.body.number) != 'number'){
              res.status(400).send("ERROR.  Confirm all parameters are initialized correctly.").end();
              return;
            }

            //If user didn't pass a ship or arrival date, intialize to empty
            var ship = req.body.current_ship;
            var arr_date = req.body.arrival_date;


            //See if user is trying to edit slip number such that it is no longer unique
            //   Does number already exist on another slip?
            return get_slips().then( slips =>{
                var slipsLen = slips.length;
                for(var i = 0; i < slipsLen; i++){
                  fromDatastore(slips[i]);
                  if((slips[i].number == req.body.number) && (slips[i].id != req.params.id)) {
                    res.status(409).end(); //409, already exists
                    return;
                  }
                }

                //Edit slip based on what was passed
                if(typeof(ship) != 'undefined' && typeof(arr_date) != 'undefined'){
                  put_slip(req.params.id, req.body.number, ship, arr_date)
                  .then(res.status(200).end());
                } else {
                  put_slip(req.params.id, req.body.number, "", "")
                  .then(res.status(200).end());
                }
            });

          } else { // Slip doesn't exist
            res.status(404).end();
          }
      }); // return get_slip()
});

//Delete a slip
router.delete('/slips/:id', function(req, res){

        //See if slip exists
        return get_slip(req.params.id).then( exists => {
            if(exists){
              delete_slip(req.params.id).then(res.status(204).end());
            } else {
              res.status(404).end();
            }
        });

});

//Park a ship in a slip
router.post('/slips/:slip_id/ships/:ship_id', function(req, res){

      var ship; //Holds ship info, if it exists

      //Confirm that both ship/slip exist
      return get_ship(req.params.ship_id).then( shipExists =>{
          //Ship returns ship object if it exists, false if not
          if(shipExists){
            ship = shipExists;

            // Check slip exists
            return get_slip(req.params.slip_id).then( slipExists => {

                //Returns slip object if exists, check to see if empty
                if(slipExists){ // Here we know both ship/slip exist

                  //  if slip empty, park the ship, else send forbidden 403
                  if(slipExists.current_ship == ""){
                      // First
                      //If residing in another slip, unmoor from old slip
                       get_slips().then( slips=>{
                         slipsLen = slips.length;
                         var otherSlip = false; //Is ship residing in another slip
                         var oldSlip; // Will hold old slip info, if we need to remove ship

                         //Iterate over all slips, if ship name found there, empty it
                         for(var i = 0; i < slipsLen; i++){
                           fromDatastore(slips[i]);
                           if(ship.name == slips[i].current_ship && slips[i].id != req.params.slip_id){
                             otherSlip = true;
                             oldSlip = slips[i];
                           }
                         }
                         if(otherSlip){  // Removes ship from old slip
                           put_slip(oldSlip.id, oldSlip.number, "", "");
                         }
                       }).then( nothing =>{
                         //Returns date string in American date format mm/dd/yyyy
                         var today = new Date().toLocaleDateString("en-US");

                         //Finally park ship, and if it was in a previous slip, remove it
                         put_slip(req.params.slip_id, slipExists.number, ship.name, today);

                       }).then(res.status(200).end()); //Send success



                  } else { // Ship already parked there, forbidden
                    res.status(403).end();
                    return;
                  }

                } else { // Slip doesn't exist
                  res.status(404).end();
                  return;
                }
            }); // return get_slip
          } else { // Ship doesn't exist
            res.status(404).end();
            return;
          }
      }); // return get_ship
});


//Remove ship from a slip
router.delete('/slips/:slip_id/ships/:ship_id', function(req, res){
    //Confirm that both ship/slip exist
    var ship; //Holds ship info, if it exists

    //Confirm that both ship/slip exist
    return get_ship(req.params.ship_id).then( shipExists =>{
        //Ship returns ship object if it exists, false if not
        if(shipExists){
          ship = shipExists;

          // Check slip exists
          return get_slip(req.params.slip_id).then( slipExists => {

              //Returns slip object if exists, check to see if empty
              if(slipExists){ // Here we know both ship/slip exist

                  //Check first that ship parked at slip matches
                  //    ship we are trying to remove
                  // If they don't match, send back forbidden otherwise clear slip
                  if(ship.name == slipExists.current_ship){
                    fromDatastore(slipExists);
                    put_slip(slipExists.id, slipExists.number, "", "").then(res.status(200).end());
                    return;
                  } else{
                    res.status(403).end(); // Tried to remove ship other than
                    return;                    // the one passed in URL
                  }

              } else { // Slip doesn't exist
                res.status(404).end();
                return;
              }
          }); // return get_slip
        } else { // Ship doesn't exist
          res.status(404).end();
          return;
        }
    }); // return get_ship

});
/* ------------- End Slip Controller Functions ------------- */
