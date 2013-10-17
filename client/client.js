// Places -- client

Meteor.subscribe("directory");
Meteor.subscribe("places");
Meteor.subscribe("resources");
Meteor.subscribe("services");

Meteor.Router.add({
  '/admin': 'admin',
  '/': 'main',
  '*': '404'
});

// If no place selected, select one.
Meteor.startup(function () {
  Meteor.call("getNodeEnv", function (error, result) {
    console.log("app environment: " + result);
  });

  Deps.autorun(function () {
    if (! Session.get("selected")) {
      var place = Places.findOne();
      if (place)
        Session.set("selected", place._id);
    }
  });
});

///////////////////////////////////////////////////////////////////////////////
// Place details sidebar

Template.details.place = function () {
  return Places.findOne(Session.get("selected"));
};

Template.details.anyPlaces = function () {
  return Places.find().count() > 0;
};

Template.details.creatorName = function () {
  var owner = Meteor.users.findOne(this.owner);
  if (owner._id === Meteor.userId())
    return "me";
  return displayName(owner);
};

Template.details.canRemove = function () {
  return this.owner === Meteor.userId() && attending(this) === 0;
};

Template.details.maybeChosen = function (what) {
  var myRsvp = _.find(this.rsvps, function (r) {
    return r.user === Meteor.userId();
  }) || {};

  return what == myRsvp.rsvp ? "chosen btn-inverse" : "";
};

Template.details.events({
  'click .rsvp_yes': function () {
    Meteor.call("rsvp", Session.get("selected"), "yes");
    return false;
  },
  'click .rsvp_maybe': function () {
    Meteor.call("rsvp", Session.get("selected"), "maybe");
    return false;
  },
  'click .rsvp_no': function () {
    Meteor.call("rsvp", Session.get("selected"), "no");
    return false;
  },
  'click .invite': function () {
    openInviteDialog();
    return false;
  },
  'click .remove': function () {
    Places.remove(this._id);
    return false;
  }
});

///////////////////////////////////////////////////////////////////////////////
// Place attendance widget

Template.attendance.rsvpName = function () {
  var user = Meteor.users.findOne(this.user);
  return displayName(user);
};

Template.attendance.outstandingInvitations = function () {
  var place = Places.findOne(this._id);
  return Meteor.users.find({$and: [
    {_id: {$in: place.invited}}, // they're invited
    {_id: {$nin: _.pluck(place.rsvps, 'user')}} // but haven't RSVP'd
  ]});
};

Template.attendance.invitationName = function () {
  return displayName(this);
};

Template.attendance.rsvpIs = function (what) {
  return this.rsvp === what;
};

Template.attendance.nobody = function () {
  return ! this.public && (this.rsvps.length + this.invited.length === 0);
};

Template.attendance.canInvite = function () {
  return ! this.public && this.owner === Meteor.userId();
};

///////////////////////////////////////////////////////////////////////////////
// Map display

Template.leafletMap.created = function() {
  var mapViewDefault = { 
    latlng: [37.35024, -121.95751], 
    zoom: 13 
  }; // santa clara :) TBD: replace with auto-locate

  console.log("template leafletMap created");
  Session.set('mapView', mapViewDefault);
  this.renderCount = 0;
};

Template.leafletMap.rendered = function() {

  var self = this;
  var last = {};
  last.view = {};

  console.log("render iteration " + this.renderCount);
  if (this.renderCount > 0) {
    console.log("workaround for leaflet rerender call #" + this.renderCount);
    return;
  }
  this.renderCount++;
  var view = Session.get('mapView');
  console.log("view: latlng=" + view.latlng.toString() + ",zoom=" + view.zoom +")");
  var llmap = L.map('leaflet-map', {maxZoom: 16, minZoom: 3, noWrap: true}).
    setView(view.latlng, view.zoom).
    locate({maximumAge : 1000 * 60, setView: false}).
    whenReady(function () { console.log("leaflet ready")});

  L.tileLayer('http://services.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18,
    attribution : 'Tiles: &copy; Esri, National Geographic'
  }).addTo(llmap);

  llmap.on('moveend', function(e) {
    var view = {};
    view.zoom = llmap.getZoom();
    view.latlng = llmap.getCenter();
    console.log('moveend: latlng=' + view.latlng.toString());
    Session.set('mapView', view);
  });
  
  llmap.on('click', function(e) {
    console.log('clicked at latlong: ' + e.latlng);

    // ctrl is meta key to add a new place
    if (e.originalEvent.ctrlKey === true) {
      if (! Meteor.userId()) {
        console.log("must be logged in to create events");
        return;
      }
      openCreateDialog(e.latlng.lat, e.latlng.lng);
    }
  });  

  var userLocationMarker;

  llmap.on('locationfound', function(e) {
    var view = {};
    if (last.view.userLatlng != e.latlng) {
      if (userLocationMarker) {
        // remove previous user location circle
        llmap.removeLayer(userLocationMarker);
      }
      // mark user on the map with circle
      userLocationMarker = new L.CircleMarker(
        e.latlng, { color: 'yellow' /* for blue: '#15f'*/, 
          opacity: 0.9,
          fillOpacity: 0.6,
          radius: 10, 
          stroke: true});
      userLocationMarker.addTo(llmap);
      console.log("updated current location marker to " + e.latlng);
    }

    view.userLatlng = e.latlng;

    // pan the map to user location
    view.latlng = e.latlng;
    view.zoom = 15;

    console.log('locationfound: latlng=' + view.latlng.toString());
    Session.set('mapView', view);
  });

  llmap.on('locationerror', function(e) {
    console.log('locationerror: ' + e.message + " " + e.code);
  });

  // closure vars
  var markers = [];

  // control all markers via a single layer
  var markerLayer = L.layerGroup().addTo(llmap);
  var staticRoot = "https://s3.amazonaws.com/plentyhood/"
  var leafletStaticFolder = staticRoot + "leaflet/images/";
  var markerIcon = L.icon({
    iconUrl: leafletStaticFolder + "marker-icon.png",
    shadowUrl: leafletStaticFolder + "marker-shadow.png",
  });

  var markerUnselectedStyle = {
    icon: markerIcon,
    riseOnHover: true, 
    opacity: 0.5,
  };
  var markerSelectedStyle = {
    icon: markerIcon,
    riseOnHover: true,
  };

  function drawLocations() {

    // before redawing markers, delete the current ones
    // TBD optimization: update only the markers which change
    _.each(markers, function (c) {
      markerLayer.removeLayer(c);
    });
    var places = Places.find().fetch();
    markers = [];
    var selected = Session.get('selected');
    _.each(places, function (place) {
      var latlng = [place.lat, place.lng];

      var style = selected == place._id ? 
        markerSelectedStyle : markerUnselectedStyle;

      var m = L.marker(latlng, style).addTo(markerLayer);
      m.placeId = place._id;
      m.on('click', function(e) {
        Session.set("selected", this.placeId);
      });
      markers.push(m);
    });
  }

  this.handle = Deps.autorun(function () {
    var places = Places.find().fetch();
    var selected = Session.get('selected');
    var view = Session.get('mapView');

    console.log("mapHandle: places=" + places.length +
                  " selected=" + selected);

    if (places.length == 0 || selected == last.selected) {
      console.log("mapHandle: skipping update");
      return;
    }
    if (!objectsEqual(last.view, view))
      llmap.setView(view.latlng, view.zoom);
    drawLocations();
    last.view = view;
  });
};

///////////////////////////////////////////////////////////////////////////////
// Create Place dialog

var openCreateDialog = function (lat, lng) {
  Session.set("createCoords", {lat: lat, lng: lng});
  Session.set("createError", null);
  Session.set("showCreateDialog", true);
};

Template.pageHeader.showCreateDialog = function () {
  return Session.get("showCreateDialog");
};

Template.createDialog.events({
  'click .save': function (event, template) {
    var title = template.find(".title").value;
    var description = template.find(".description").value;
    var public = ! template.find(".private").checked;
    var coords = Session.get("createCoords");

    if (title.length && description.length) {
      Meteor.call('createPlace', {
        title: title,
        description: description,
        lat: coords.lat,
        lng: coords.lng,
        public: public
      }, function (error, place) {
        if (! error) {
          Session.set("selected", place);
          if (! public && Meteor.users.find().count() > 1)
            openInviteDialog();
        }
      });
      Session.set("showCreateDialog", false);
    } else {
      Session.set("createError",
                  "It needs a title and a description, or why bother?");
    }
  },

  'click .cancel': function () {
    Session.set("showCreateDialog", false);
  }
});

Template.createDialog.error = function () {
  return Session.get("createError");
};

///////////////////////////////////////////////////////////////////////////////
// Invite dialog

var openInviteDialog = function () {
  Session.set("showInviteDialog", true);
};

Template.pageHeader.showInviteDialog = function () {
  return Session.get("showInviteDialog");
};

Template.inviteDialog.events({
  'click .invite': function (event, template) {
    Meteor.call('invite', Session.get("selected"), this._id);
  },
  'click .done': function (event, template) {
    Session.set("showInviteDialog", false);
    return false;
  }
});

Template.inviteDialog.uninvited = function () {
  var place = Places.findOne(Session.get("selected"));
  if (! place)
    return []; // place hasn't loaded yet
  return Meteor.users.find({$nor: [{_id: {$in: place.invited}},
                                   {_id: place.owner}]});
};

Template.inviteDialog.displayName = function () {
  return displayName(this);
};

// generic helpers
function objectsEqual(o1, o2) {
  // note this only compare fields, not methods
  return JSON.stringify(o1) == JSON.stringify(o2);
}
