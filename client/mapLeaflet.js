///////////////////////////////////////////////////////////////////////////////
// Leaflet Map
///////////////////////////////////////////////////////////////////////////////

var leafletMapCreated = false;
var renderCount;

Template.leafletMap.created = function() {
  if (leafletMapCreated) {
    console.log("warning: template created more than once!");
  }
  else {
    leafletMapCreated = true;
    var mapViewDefault = { 
      latlng: [37.35024, -121.95751], 
      zoom: 13 
    }; // santa clara :) TBD: replace with auto-locate

    console.log("template leafletMap created");
    Session.set('mapView', mapViewDefault);
    renderCount = 0;
  }
};

Template.leafletMap.rendered = function() {

  var self = this;
  var last = {};
  last.view = {};

  if (renderCount++ > 0) {
    // workaround for meteor-leaflet issue
//     console.log("leaflet rendered skip", renderCount);
    return;
  }
  console.log("render iteration " + renderCount);
  var view = Session.get('mapView');
  console.log("view: latlng=" + view.latlng.toString() + ",zoom=" + view.zoom +")");
  var llmapOptions = {
    maxZoom: 16,
    minZoom: 3,
    noWrap: true,
    zoomControl: false,
  };
  var llmap = L.map('leaflet-map', llmapOptions).
    setView(view.latlng, view.zoom).
    locate({maximumAge : 1000 * 60, setView: false}).
    whenReady(function () { console.log("leaflet ready")});
  L.tileLayer('http://services.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18,
    attribution : 'Tiles: &copy; Esri, National Geographic'
  }).addTo(llmap);
  llmap.addControl(L.control.zoom({position: 'topright'}));

  llmap.on('moveend', function(e) {
    var view = {};
    view.zoom = llmap.getZoom();
    view.latlng = llmap.getCenter();
//     console.log('moveend: latlng=' + view.latlng.toString());
    Session.set('mapView', view);
  });
  
  llmap.on('click', function(e) {
    //     console.log('clicked at latlong: ' + e.latlng);

    // ctrl is meta key to add a new place
    if (e.originalEvent.ctrlKey === true) {
      if (! Meteor.userId()) {
        console.log("must be logged in to create events");
        return;
      }
      schedCreateDialog(e.latlng.lat, e.latlng.lng);
    }
  });  

  var userLocationMarker;

  llmap.on('locationfound', function(e) {
    var view = {};
    if (last.view.userLatlng != e.latlng) {
      if (userLocationMarker) {
        // remove previous user location
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
    var places = App.collections.Places.find().fetch();
    markers = [];
    var selected = Session.get('selectedPlace');
    last.selectedPlace = selected;
    _.each(places, function (place) {
      var latlng = [place.lat, place.lng];

      var style = selected == place._id ? 
        markerSelectedStyle : markerUnselectedStyle;

      var m = L.marker(latlng, style).addTo(markerLayer);
      m.placeId = place._id;
      m.on('click', function(e) {
        Session.set("selectedPlace", this.placeId);
      });
      markers.push(m);
    });
  }

  this.handle = Deps.autorun(function () {
    var places = App.collections.Places.find().fetch();
    var selected = Session.get('selectedPlace');

//     console.log("mapHandle: places=" + places.length +
//                   " selected=" + selected);
    drawLocations();
  });

  this.handleMapChange = Deps.autorun(function () {
    var view = Session.get('mapView');
    if (!objectsEqual(last.view, view)) {
      llmap.setView(view.latlng, view.zoom);
    }
    last.view = view;
  });
};

function objectsEqual(o1, o2) {
  // note this only compare fields, not methods
  return JSON.stringify(o1) == JSON.stringify(o2);
};