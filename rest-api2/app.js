/* Author:  Zach Mitchell, mitcheza@oregonstate.edu
   CS493, FALL 2018 - HW4 Ship/cargo RESTful API
   10/25/2018
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

//Kinds in the Datastore
const SHIP = "Ship";
const CARGO = "Cargo";

app.use('/', router);

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
   console.log(`Server listening on port ${PORT}...`);
});

/*--------Helper functions ---------------------*/

//Return the item/key data w/id
function fromDatastore(item){
            item.id = item[Datastore.KEY].id;
            return item;
}

//Adds a self links to an object and it's object relationships
async function addSelfLink(req, item){
            console.log("INSIDE SELF LINK");
            item.self = "https://" + req.get("host") + req.route.path + "/" + item.id;

            //Is it a ship w/cargo, or cargo with a carrier?
            //   So we can populate selflinks dynamically for them
            var relationshipType = (item[Datastore.KEY].kind == 'Ship') ? 'cargo': 'ships';
            if(relationshipType == 'cargo'){ //If we have a ship w/ cargo
              let cargoSz = item.cargo.length;
              for(var i = 0; i < cargoSz; i++){  //Iterate over cargo and add self links
                item.cargo[i].self = "https://" + req.get("host") + "/" + relationshipType + "/" + item.cargo[i].id;
              }
              //return item;
            } else if (relationshipType == 'ships') {  //If we have cargo
                if(typeof(item.carrier) == 'object'){ //If cargo has carrier
                   await get_ship(item.carrier.id).then((ship)=>{ //Dynamically assign carrier name/self
                    item.carrier.name = ship.name;
                    item.carrier.self = "https://" + req.get("host") + "/" + relationshipType + "/" + item.carrier.id;
                    console.log("RETURNING ITEM");
                    console.log(item);
                    return item;
                  });
                }
            }
}

//Unload All Cargo (for delete ship)
async function unloadAllCargo(cargo){
  console.log(cargo);
  let cargoSz = cargo.length;
  console.log("**************CARGO SZ TO UNLOAD: " + cargoSz+ " *************************");
  for(var i = 0; i < cargoSz; i++){
    console.log("UNLOADING CARGO ********************** " + cargo[i].id);
    return await get_single_cargo(cargo[i].id).then((cargoUnit)=>{
      console.log("UNLOADING CARGO: ********************** " + i);
       await put_cargo(cargoUnit.id, cargoUnit.weight, "", cargoUnit.content, cargoUnit.delivery_date);
    });
  }
  return true;
}

//Unload Single Cargo unload cargo router function (and delete cargo)
async function unloadSingleCargo(ship, cargoRemoved){
  console.log("UNLOAD SINGLE CARGO");
  console.log("cargo array");
  console.log(ship.cargo);
  let cargoSz = ship.cargo.length;
  for(var i = 0; i < cargoSz; i++){
    console.log(ship.cargo[i].id + " =? " + cargoRemoved.id);
    if(ship.cargo[i].id == cargoRemoved.id){
      console.log("match");
     (ship.cargo).splice(i, 1);
    }
    console.log("cargo array");
    console.log(ship.cargo);
    await put_ship(ship.id, ship.name, ship.type, ship.length, ship.cargo).then(()=>{
       put_cargo(cargoRemoved.id, cargoRemoved.weight, "" , cargoRemoved.content, cargoRemoved.delivery_date);
    });
  }
}

//Function used below that adds ship name/self dynamically
async function readyOutput (req, input) {
  console.log(input);
  let inputLen = input.items.length;
  console.log(inputLen);
  if(inputLen > 0){
    for(var i = 0; i < inputLen; i++){
      await addSelfLink(req, input.items[i]);
    }
  }
  return input;
};

/*--------End Helper functions ---------------------*/


/* ------------- Ship Model Functions ------------- */

// Return all ships
function get_ships(req){
        var q = datastore.createQuery(SHIP).order('name').limit(3);
        var results = {}; //returned to user
        if(Object.keys(req.query).includes("cursor")){ //If there is a cursor
          q.startVal = (req.query.cursor).replace(/ /g, "+"); //Set start of retrieval at cursor in URI format
        }
        console.log("QUERY");
        console.log(q);
        return datastore.runQuery(q).then( entities => {
          results.items = entities[0];
          console.log("CURSOR");
          console.log(entities[1]);
          if(entities[1].moreResults !== Datastore.NO_MORE_RESULTS){
            results.next = "https://" + req.get("host") + "/ships?cursor=" + entities[1].endCursor;
          } else {
            results.next = "END OF RESULTS";
          }
          return results;
        }).catch( errr => {
            console.log(errr);
            return false;
        });
}

//Return a single ship
function get_ship(id){
        console.log("INSIDE GET_SHIP");
        const key = datastore.key([SHIP, parseInt(id,10)]);
        return datastore.get(key).then( result => {
            var ship = result[0];
            ship.id = id; //Add id property to ship
            console.log("EXITING GET_SHIP");
            return ship;

        }).catch( err => {
            return false;
        });
}

//Add a new ship
function post_ship(name, type, length){
        console.log("INSIDE POST_SHIP");
        var key = datastore.key(SHIP);
        const new_ship = { "name": name, "type": type, "length": length, "cargo":[]};
        console.log("EXITING POST_SHIP");
        return datastore.save({"key":key, "data":new_ship}).then(() =>
        {return key}).catch( err => {
            return false;
        });
}



// Edit a ship
function put_ship(id, name, type, length, cargo){
        console.log("INSIDE PUT_SHIP");
        const key = datastore.key([SHIP, parseInt(id,10)]);
        const ship = {"name": name, "type": type, "length": length, "cargo": cargo};
        console.log("returning: ");
        console.log("datastore.save()");
        return datastore.save({"key":key, "data":ship})
        .catch( err => {
            return false;
        });
}

//Remove ship from datastore
function delete_ship(id){
        console.log("INSIDE DELETE_SHIP");
        const key = datastore.key([SHIP, parseInt(id,10)]);
        return datastore.get(key).then( result => {

          //Delete the ship
          return datastore.delete(key).then(()=>{
            console.log("EXITING DELETE SHIP");
            return true;
          });
        }).catch( err => {
            return false;
        });
}

/* ------------- End Ship Functions ------------- */

/* ------------- Begin Cargo Model Functions ------------- */

// Return all cargo, by order of delivery date
function get_all_cargo(req){
        var q = datastore.createQuery(CARGO).limit(3);
        var results = {}; //returned to user
        if(Object.keys(req.query).includes("cursor")){ //If there is a cursor
          q.startVal = (req.query.cursor).replace(/ /g, "+"); //Set start of retrieval at cursor in URI format
        }
        console.log("QUERY");
        console.log(q);
        return datastore.runQuery(q).then( entities => {
          results.items = entities[0];
          console.log("CURSOR");
          console.log(entities[1]);
          if(entities[1].moreResults !== Datastore.NO_MORE_RESULTS){
            results.next = "https://" + req.get("host") + "/cargo?cursor=" + entities[1].endCursor;
          } else {
            results.next = "END OF RESULTS";
          }

          return results;
        }).catch( err => {
            return false;
        });
}

//Return a single cargo
function get_single_cargo(id){
        console.log("inside get_single_cargo: " + id);
        const key = datastore.key([CARGO, parseInt(id,10)]);
        return datastore.get(key).then( result => {
            var cargo = result[0];
            cargo.id = id; //Add id property to ship
            return cargo;
        }).catch( err => {
          console.log("ERR");
            return false;
        });
}


//Add new cargo
function post_cargo(weight, content, delivery_date){
        var key = datastore.key(CARGO);
        const new_cargo = { "weight": weight, "carrier": '', "content": content,
            "delivery_date": delivery_date};
        return datastore.save({"key":key, "data":new_cargo}).then(() =>
         {return key}).catch( err => {
             return false;
         });
}

// Edit cargo
function put_cargo(id, weight, carrier, content, delivery_date){
        console.log("INSIDE PUT_CARGO");
        const key = datastore.key([CARGO, parseInt(id,10)]);
        const ship = {"weight": weight, "carrier": carrier, "content": content, "delivery_date": delivery_date};
        console.log("EXITING PUT_CARGO");
        return datastore.save({"key":key, "data":ship})
        .catch( err => {
            return false;
        });
}

//Remove cargo from datastore
function delete_cargo(id){
      console.log("INSIDE DELETE_CARGO");

        const key = datastore.key([CARGO, parseInt(id,10)]);
        return datastore.get(key).then( result => {
          console.log("EXITING DELETE_CARGO");

          //Delete the cargo
          return datastore.delete(key);
        }).catch( err => {
            return false;
        });
}

/* ------------- End Cargo Functions ------------- */



/***************** BEGIN ROUTER / CONTROLLER FUNCTIONS BASED ON URL ********************/



/* ------------- Begin Ship Controller Functions ------------- */
//Get all ships
router.get('/ships', function(req, res){

            return get_ships(req)  // Get all ships
            .then( (ships) => {
              console.log("before adding ids");
              console.log(ships);
              ships.items.map(fromDatastore); // Add id's
              return ships;
            }).then( ships => {
              console.log("before adding selfLinks");
              console.log(ships);
              return readyOutput(req, ships); // Add ships' names/selfs
            }).then(final=>{
              console.log("AFTER selfLinks");
              console.log(final);
              res.status(200).json(final); //Return the goodies
            });
});

//Get a single ship
router.get('/ships/:id', function(req, res){
            var id = req.params.id;
            var ship = get_ship(id)
            .then( (ship) => {
              //Send error if not found
                if(ship){
                  req.route.path = "/ships"; //Make sure path is set for addSelfLink()
                  addSelfLink(req, ship).then(()=>{//Add selfLink dynamically for output
                    res.status(200).json(ship);
                  });

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
               return post_ship(req.body.name, req.body.type, req.body.length)
               .then( key => {res.status(201).send('{ "id": ' + '"' + key.id + '" }')} );
            }
});

// Edit a ship
router.put('/ships/:id', function(req, res){
            //If user didn't fill out all properties
            if(typeof (req.body.name) != 'string' ||
               typeof (req.body.type) != 'string' ||
               typeof (req.body.length) != 'number'){
              res.status(400).send("ERROR.  Confirm all parameters are initialized correctly.").end();
              return;
            } else {

              // See if ship exists in datastore to edit
              return get_ship(req.params.id).then( shipExists =>{
                if(shipExists){
                  //Edit ship, then send success message
                  put_ship(req.params.id, req.body.name, req.body.type, req.body.length, shipExists.cargo)
                  .then(res.status(200).end());

                } else {
                  //Ship doesn't exist
                  res.status(404).end();
                }
              });
           }
});

//Delete a ship
router.delete('/ships/:id', function(req, res){
            //See if ship exists
            console.log("**************DELETING A SHIP*************************");
            return get_ship(req.params.id).then( shipExists => {
              //if so clear cargo, perform delete, else send back not found
              if(shipExists){
                console.log("**************UNLOADING CARGO*************************");
                //Clear ship of cargo
                var cargoLoad = shipExists.cargo;

                  console.log("**************ABOUT TO DELETE SHIP: "+ req.params.id + " ********************");
                  delete_ship(req.params.id).then(()=>{
                    console.log("SENDING 204, SUCCESSFUL DELETE");
                    unloadAllCargo(cargoLoad).then(()=>{
                      res.status(204).end();
                    });
                  });

              } else {
                res.status(404).end();  //Ship not found
              }
          });
});

/* ------------- End Ship Controller Functions ------------- */

/* ------------- Begin Cargo Controller Functions ------------- */

//Get all cargo
router.get('/cargo', function(req, res){

            return get_all_cargo(req)  // Get all ships
            .then( (cargo) => {
              console.log("before adding ids");
              console.log(cargo);
              cargo.items.map(fromDatastore); // Add id's
              return cargo;
            }).then( cargo => {
              console.log("before adding selfLinks");
              console.log(cargo);
              return readyOutput(req, cargo); // Add ships' names/selfs
            }).then(final=>{
              console.log("AFTER selfLinks");
              console.log(final);
              res.status(200).json(final); //Return the goodies
            });
});

//Get a single cargo load
router.get('/cargo/:id', function(req, res){
            return get_single_cargo(req.params.id)
            .then( (cargo) => {
                //If cargo not found send error
                if(cargo){
                  req.route.path = "/cargo"; //Make sure path is set for addSelfLink()
                  addSelfLink(req, cargo).then(()=>{
                    res.status(200).json(cargo);
                  });
                } else {
                  res.status(404).end();
                }
            });
});

// Add new cargo
router.post('/cargo', function(req, res){
            //If user didn't fill out all properties
            if(typeof (req.body.weight) != 'number' ||
               typeof (req.body.content) != 'string' ||
               typeof (req.body.delivery_date) != 'string'){
              res.status(400).send("ERROR.  Confirm all parameters are initialized correctly.").end();
            } else {
              //All properties initialized, add to datastore
               post_cargo(req.body.weight, req.body.content, req.body.delivery_date)
               .then( key => {res.status(201).send('{ "id": ' + '"' + key.id + '" }')} );
            }
});

//Edit existing cargo
router.put('/cargo/:id', function(req, res){

    //See if cargo exists
    return get_single_cargo(req.params.id).then( cargoExists =>{

        if(cargoExists){
            //Confirm user passed number in correct form
            if(typeof (req.body.weight) != 'number' ||
               typeof (req.body.content) != 'string' ||
               typeof (req.body.delivery_date) != 'string'){
              res.status(400).send("ERROR.  Confirm all parameters are initialized correctly.").end();
              return;
            }
            console.log("CARGO EXISTS");

              //Supply edit
              put_cargo(req.params.id, req.body.weight, cargoExists.carrier,
                  req.body.content, req.body.delivery_date).then(res.status(200).end());

          } else { // Cargo doesn't exist
            res.status(404).end();
          }
      }); //Return get single cargo
});

//Delete cargo
router.delete('/cargo/:id', function(req, res){
        var cargo; //Holds cargo to delete
        //See if cargo exists
        return get_single_cargo(req.params.id).then( exists => {
            if(exists){

              cargo = exists; //Returns cargo object

              //Clear ship of cargo if necessary
              if (cargo.carrier !== ""){
                console.log("CARGO HAD A SHIP");
                return get_ship(exists.carrier.id).then((ship)=>{
                  return unloadSingleCargo(ship, cargo);
                }).then((nada)=>{
                   return delete_cargo(req.params.id);
                }).then((nada)=>{
                  console.log("SENDING 204 SUCCESS");
                  res.status(204).end();
                });
              } else { // Cargo was not on a ship
                delete_cargo(req.params.id).then(res.status(204).end());
              }
            } else { //Cargo doesn't exist
              res.status(404).end();
            }
        });
});

//Add Cargo to Ship
router.put('/ships/:ship_id/cargo/:cargo_id', function(req, res){

      var ship; //Holds ship info, if it exists
      console.log("ENTERING LOAD SHIP ");
      //Confirm that both ship/cargo exist
      return get_ship(req.params.ship_id).then( shipExists =>{
          //Ship returns ship object if it exists, false if not
          if(shipExists){
            ship = shipExists;

            // Check cargo exists
            return get_single_cargo(req.params.cargo_id).then( cargoExists => {

                //Returns cargo object if exists, check to see if it's already on a ship
                if(cargoExists){ // Here we know both ship/cargo exist

                  //  if cargo is not on a ship, place it, otherwise send forbidden 403
                  if(cargoExists.carrier == ""){
                        var addedShip = {};
                        addedShip.id = ship.id;

                        //Add carrier to cargo
                          return put_cargo(cargoExists.id, cargoExists.weight, addedShip,
                            cargoExists.content, cargoExists.delivery_date).then( nothing =>{
                             //Add cargo to carrier
                             var addedCargo = {};
                             addedCargo.id = cargoExists.id;
                             ship.cargo.push(addedCargo);
                             console.log("addedCargo");
                             console.log(addedCargo);
                             console.log("ship.cargo");
                             console.log(addedCargo);
                             //Edit ship
                             return put_ship(ship.id, ship.name, ship.type, ship.length, ship.cargo);

                       }).then(()=>{

                          console.log("SENDING LOADED SUCCESS 200")
                         res.status(200).end()}); //Send success

                  } else { // Cargo already on a ship, forbidden
                    res.status(403).end();
                    return;
                  }

                } else { // Cargo doesn't exist
                  res.status(404).end();
                  return;
                }

            });
          } else { // Ship doesn't exist
            res.status(404).end();
            return;
          }
      }); // return get_ship
});


//Remove cargo from ship
router.delete('/ships/:ship_id/cargo/:cargo_id', function(req, res){
    //Confirm that both ship/cargo exist
    var ship; //Holds ship info, if it exists
    console.log("ENTERING UNLOAD SHIP");
    //Confirm that both ship/cargo exist
    return get_ship(req.params.ship_id).then( shipExists =>{
        //Ship returns ship object if it exists, false if not
        if(shipExists){
          ship = shipExists;

          // Check Cargo exists
          return get_single_cargo(req.params.cargo_id).then( cargoExists => {

              //Returns cargo object if exists
              if(cargoExists){ // Here we know both ship/cargo exist

                return unloadSingleCargo(ship, cargoExists).then(()=>{
                  console.log("RETURNING UNLOAD SHIP SUCCESS200");
                  res.status(200).end();
                });

              } else { // Cargo doesn't exist
                res.status(404).end();
              }
          }); // return get_single_cargo
        } else { // Ship doesn't exist
          res.status(404).end();
        }
    }); // return get_ship

});
/* ------------- End Cargo Controller Functions ------------- */
