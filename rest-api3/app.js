/* Author:  Zach Mitchell, mitcheza@oregonstate.edu
   CS493, FALL 2018 - HW5 RESTful API
   11/2/2018
*/

//Necesseties for Node / Project
const express = require('express');
const app = express();

const Datastore = require('@google-cloud/datastore');
const bodyParser = require('body-parser');

const projectId = 'mitcheza-api-3';
const datastore = new Datastore({projectId:projectId});

const router = express.Router();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));

//Kinds in the Datastore
const SHIP = "Ship";

app.use('/ships', router);

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
   console.log(`Server listening on port ${PORT}...`);
});

/*--------Helper functions ---------------------*/

//Return the item/key data w/id
function addIDandSelfLink(req, item){
            item.id = item[Datastore.KEY].id;
            item.self = "https://" + req.get("host") + "/ships/" + item.id;
            return item;
}


/*--------End Helper functions ---------------------*/


/* ------------- Ship Model Functions ------------- */

// Return all ships
function get_ships(req){
        var q = datastore.createQuery(SHIP).order('name');
        return datastore.runQuery(q).then( entities => {
          results = entities[0];
          results.map( function(x) {//Add ID and SelfLink
            return addIDandSelfLink(req, x);
          });
          return results;
        }).catch( errr => {
            console.log(errr);
            return false;
        });
}

//Return a single ship
function get_ship(req){
        const key = datastore.key([SHIP, parseInt(req.params.id,10)]);
        return datastore.get(key).then( result => {
            var ship = result[0];
            addIDandSelfLink(req, ship);

            if(req.get('accept') == 'text/html'){ //Convert object to html
              console.log("HTML VERSION");
              var htmlVersion = "<ul>";
              for(var prop in ship){
                htmlVersion += "<li>" + prop + ": " + ship[prop] + "</li>";
              }
              htmlVersion += "</ul>";
              return htmlVersion; //Returns html/text version

            } else {

              return ship;  //Returns json version
            }
        }).catch( err => {
            return false;
        });
}

//Add a new ship
function post_ship(name, type, length){
        console.log("INSIDE POST_SHIP");
        var key = datastore.key(SHIP);
        const new_ship = { "name": name, "type": type, "length": length};
        console.log("EXITING POST_SHIP");
        return datastore.save({"key":key, "data":new_ship}).then(() =>
        {return key}).catch( err => {
            return false;
        });
}



// Edit a ship
function put_ship(id, name, type, length){
        console.log("INSIDE PUT_SHIP");
        const key = datastore.key([SHIP, parseInt(id,10)]);
        const ship = {"name": name, "type": type, "length": length};
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


/***************** BEGIN ROUTER / CONTROLLER FUNCTIONS BASED ON URL ********************/



/* ------------- Begin Ship Controller Functions ------------- */
//Get all ships
router.get('/', function(req, res){

            return get_ships(req)  // Get all ships
            .then(final=>{
              console.log("AFTER selfLinks");
              console.log(final);
              res.status(200).json(final); //Return the goodies
            });
});

//Get a single ship
router.get('/:id', function(req, res){

            var reqAccepts = req.get('accept');  // Get content type and see if it's acceptable type
            console.log("ACCEPTS");
            console.log(reqAccepts);
            var acceptableTypes = ['text/html', 'application/json', '*/*'];
            var isAcceptableType = acceptableTypes.includes(reqAccepts);

            if(isAcceptableType){
              var ship = get_ship(req)
              .then( (ship) => {
                //Send error if not found
                  if(ship){
                      if(reqAccepts == 'text/html')
                        res.status(200).send(ship); //Send html version
                      else
                        res.status(200).json(ship);  //Send json version
                  } else {
                    res.status(404).end(); //Ship doesn't exist
                  }
              });
            } else {
              res.status(406).send('Not acceptable type');
            }

});

// Add a new ship
router.post('/', function(req, res){
            //If user didn't fill out all properties
            if(typeof (req.body.name) != 'string' ||
               typeof (req.body.type) != 'string' ||
               typeof (req.body.length) != 'number'){
              res.status(400).send("ERROR.  Confirm all parameters are initialized correctly.").end()
            } else {
              //All properties initialized, add to datastore
               return post_ship(req.body.name, req.body.type, req.body.length)
               .then( key => {
                 res.location("https://" + req.get("host") + "/ships/" + key.id);
                 res.status(201).send('{ "id": ' + '"' + key.id + '" }')
               });
            }
});

//Try to edit entire ships - error
router.put('/', function(req, res){
  res.set('Accept', 'GET, POST');
  res.status(405).send("Can't edit ALL ships.");
});

//Try to delete entire ships - error
router.delete('/', function(req, res){
  res.set('Accept', 'GET, POST');
  res.status(405).send("Can't delete ALL ships.");
});


// Edit a ship
router.put('/:id', function(req, res){
            //If user didn't fill out all properties
            if(typeof (req.body.name) != 'string' ||
               typeof (req.body.type) != 'string' ||
               typeof (req.body.length) != 'number'){
              res.status(400).send("ERROR.  Confirm all parameters are initialized correctly.").end();
              return;
            } else {

              // See if ship exists in datastore to edit
              return get_ship(req).then( shipExists =>{
                if(shipExists){
                  //Edit ship, then send success message
                  return put_ship(req.params.id, req.body.name, req.body.type, req.body.length)
                  .then(()=>{
                    res.location("https://" + req.get("host") + "/ships/" + req.params.id);
                    res.status(303).end();
                  });

                } else {
                  //Ship doesn't exist
                  res.status(404).end();
                }
              });
           }
});

//Delete a ship
router.delete('/:id', function(req, res){
            //See if ship exists
            console.log("**************DELETING A SHIP*************************");
            return get_ship(req).then( shipExists => {
              //if so clear cargo, perform delete, else send back not found
              if(shipExists){
                      delete_ship(shipExists.id).then(res.status(204).end());
              } else {
                res.status(404).end();  //Ship not found
              }
          });
});



/* ------------- End Ship Controller Functions ------------- */
