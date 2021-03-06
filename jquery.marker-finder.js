/*
 *  Project: MarkerFinder
 *  Description: Functions to help you build stuff like a storefinder with Google Maps
 *  Author: Atticweb
 *  License: MIT
 *  Boilerplate script: https://github.com/jquery-boilerplate
 */

;(function($, window, document, undefined) {
  "use strict";
  // Create the defaults once
  var pluginName = 'MarkerFinder',
  defaults = {
    googleMapsKey: '',
    googleMapsID: 'map',
    googleMapsOptions: {
      center: {
        lat: 51.98150,
        lng: 5.28434
      },
      zoom: 6,
    },
    customIcon: false,
    customIconSize: false,
    customIconField: '',
    customIconSizeField: '',
    latLngFields: ['lat', 'lng'],
    fitBounds: false,
    data: {},
    dataRoot: 0,
    searchFields : ['title'],
    onClickMarker : null,
    distanceUnit : 'km',
    searchRadius : 50,
    drawSearchRadius : false
  },
  googleMapsLoaded = false,
  googleMapsDoneLoading = false,
  pluginReady = jQuery.Deferred();

  // plugin constructor
  function Plugin(element, options) {
    this.element = element;
    this.options = $.extend({}, defaults, options);

    this._defaults = defaults;
    this._name = pluginName;

    //vars
    this.data = {};
    this.map = {};
    this.markers = [];
    this.markersToFilter = [];
    this.prevAddress = {
      name : '',
      result : {},
    };
    this.searchRadius = false;

    this.init();
  }

  $.extend(Plugin.prototype, {
    init: function() {
      var _this = this;
      if (this.options.googleMapsKey == '') console.warn('you forgot the googleMapsKey');
      $.when(this._handleData(), this._initializeMaps()).done( function (data, map) {
        _this.map = map;
        _this.data = data;
        _this._drawMarkers();
        pluginReady.resolve(data, map, _this.markers);
      });
    },
    
    ready: function(callback){
      return pluginReady.done(callback).promise();
    },
    
    search: function(term, cb){
      this.resetFilters();
      var regex = new RegExp(term, "i"),
          returns = [],
          anyResult = false,
          fields = this.options.searchFields;
      var i,j,k;
      
      if(term.length == 0){
        this.markersToFilter = [];
        this._filterMarkers();
        return returns;
      }
      
      for(i = 0; i < this.data.length; i++)
      {
        var found = false;
        for(j = 0; j < fields.length; j++){
          //check if item is an array or a string
          if($.isArray( this.data[i][fields[j]] )){
            for(k = 0; k < this.data[i][fields[j]].length; k++){
              if(this.data[i][fields[j]][k].search(regex) != -1){
                returns.push(this.data[i]);
                found = true;
                break;
              }
            }
          }
          else{
            if(!this.data[i][fields[j]]){
              console.error('searchField is not present in current item');
              break;
            }
            if(this.data[i][fields[j]].search(regex) != -1){
              returns.push(this.data[i]);
              found = true;
              break;
            }
          }
        }
        if(!found){
          this.markersToFilter.push(i);
        }else anyResult = true;
      }
      if(!anyResult){
        this.markersToFilter = [];
      }
      this._filterMarkers();
      cb(returns);
      return returns;
    },
    
    getFilterValues: function(filter){
      var filters = [];
      for(var dataKey in this.data)
      {
        if(!this.data[dataKey][filter]) continue;
        for(var filterKey in this.data[dataKey][filter])
        {
          if(filters.indexOf(this.data[dataKey][filter][filterKey]) == -1) filters.push(this.data[dataKey][filter][filterKey]);
        }
      }
      return filters;
    },
    
    setOption: function(optionName, value){
      this.options[optionName] = value;
      // reset previeus searched
      this.prevAddress = {
        name : '',
        result : {},
      };
    },
    
    filterData: function(filter, values, reset){
      if(!reset) this.resetFilters();
      var ids = [];
      var i,j;
      for(i = 0; i < this.data.length; i++)
      {
        var found = false;
        for(j = 0; j < values.length; j++)
        {
          if(this.data[i][filter].indexOf(values[j]) != -1){
            found = true;
            break;
          }
        }
        if(!found) ids.push(i);
      }
      $.extend(true, this.markersToFilter, ids);
      this._filterMarkers();
    },
    
    resetFilters: function(){
      this.markersToFilter = [];
      this._filterMarkers();
    },
    
    fitBounds: function(all){
      all = (all === undefined || !all)?false:true;
      var bounds = new google.maps.LatLngBounds(),
          found = false;
      var i;
      for (i = 0; i < this.markers.length; i++) {
        if(this.markers[i].getVisible() || all) {
            bounds.extend( this.markers[i].getPosition() );
            found = true;
        }
      }
      if(found) this.map.fitBounds(bounds);
    },
    
    closestMarkers: function(value, hideMarkers){
      var _this = this,
          dfd = jQuery.Deferred(),
          hideMarkers = (hideMarkers === undefined)?true:hideMarkers,
          result = [];
      if(value === '' || !value) {
        // if value is empty
        this.resetFilters();
        dfd.resolve(result);
        return dfd;
      } else if (this.prevAddress.name === value) {
        // if the user clicks twice return prev result
        dfd.resolve(this.prevAddress.result);
        return dfd;
      } else {
        this.prevAddress.name = value;
        this._getCoordsByString(value).done(function(data){
          if(!data){
            // if there is no result return empty object
            _this.resetFilters();
            dfd.resolve(result);
            return dfd;
          }
          _this.resetFilters();
          result = _this._findClosestMarkers(data[_this.options.latLngFields[0]], data[_this.options.latLngFields[1]], hideMarkers);
          if(_this.options.drawSearchRadius) _this._drawSearchRadius(data[_this.options.latLngFields[0]], data[_this.options.latLngFields[1]], _this.options.searchRadius);
          _this.prevAddress.result = result;
          dfd.resolve(result);
        });
      }
      return dfd;
    },
    
    removeSearchRadius: function(){
      if(this.searchRadius) this.searchRadius.setMap(null);
    },

    _initializeMaps: function() {
      var dfd = jQuery.Deferred(),
          mapsID = this.options.googleMapsID,
          mapOptions = this.options.googleMapsOptions;
      if(googleMapsLoaded) {
        googleMapsDoneLoading.done(function() {
          dfd.resolve(new google.maps.Map(document.getElementById(mapsID), mapOptions));
        });
      }else{
        googleMapsLoaded = true;
        googleMapsDoneLoading = $.getScript("https://maps.googleapis.com/maps/api/js?key=" + this.options.googleMapsKey)
          .done(function(script, textStatus) {
            dfd.resolve(new google.maps.Map(document.getElementById(mapsID), mapOptions));
          });
      }
      return dfd.promise();
    },

    _handleData: function() {
      var _this = this,
          dfd = jQuery.Deferred();
      if($.isPlainObject(this.options.data)) {
        dfd.resolve(this._dataFromRoot());
      }else{
        //get json from url
        $.getJSON( this.options.data, function( data ) {
          dfd.resolve(_this._dataFromRoot(data));
        }).error(function(jqXHR, textStatus, errorThrown) {
            console.warn("error " + textStatus);
        });
      }
      return dfd.promise();
    },
    
    _getCoordsByString: function(address){
      var _this = this,
          dfd = jQuery.Deferred(),
          geocoder = new google.maps.Geocoder();
      geocoder.geocode( { 'address': address}, function(results, status) {
        if(status == google.maps.GeocoderStatus.OK) {
          dfd.resolve({
            'lat' : results[0].geometry.location.lat(),
            'lng' : results[0].geometry.location.lng(),
          });
        }else{
          dfd.resolve(false);
        }
      });
      return dfd;
    },
    
    _rad: function(x) {return x*Math.PI/180;},
    
    _findClosestMarkers: function ( lat, lng, hideMarkers ) {
      var R = (this.options.distanceUnit == 'km') ? 6378 : 3963,
          distances = [];
      var i;
      for(i = 0; i < this.markers.length; i++){
        var mlat = this.markers[i].position.lat(),
            mlng = this.markers[i].position.lng(),
            dLat  = this._rad(mlat - lat),
            dLong = this._rad(mlng - lng),
            a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(this._rad(lat)) * Math.cos(this._rad(lat)) * Math.sin(dLong/2) * Math.sin(dLong/2),
            c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)),
            d = R * c;
        if(d < this.options.searchRadius){
          distances.push({
            'data': this.data[i],
            'marker': this.markers[i],
            'distance': Math.ceil(d)
          });
        }else{
          if(hideMarkers) this.markersToFilter.push(this.markers[i].id);
        }
      }
      if(hideMarkers) this._filterMarkers();
      distances.sort(function(a,b){return a['distance']-b['distance'];});
      return distances;
    },

    _drawSearchRadius: function(lat, lng, radius)
    {
      this.removeSearchRadius();
      this.searchRadius = new google.maps.Circle({
        fillColor: '#FF0000',
        fillOpacity: 0.2,
        strokeWeight: 0,
        map: this.map,
        center: {lat: lat, lng: lng},
        radius: 1000*radius
      });
    },

    _drawMarkers: function() {
      var i, marker_data, data, marker, sizeParts;
      for (i = 0; i < this.data.length; i++) {
        data = this.data[i];
        marker_data = {
          position: new google.maps.LatLng(data[this.options.latLngFields[0]], data[this.options.latLngFields[1]]),
          map: this.map,
          title: data.title,
        };
        if(this.options.customIconField != '' && this.options.customIconField) {
          marker_data.icon = {};
          marker_data.icon.url = data[this.options.customIconField];
        }
        else if(this.options.customIcon != '' && this.options.customIcon){
          marker_data.icon = {};
          marker_data.icon.url = data[this.options.customIcon];
        }
        if(marker_data.icon && (this.options.customIconSizeField != "" || this.options.customIconSize != "")){
          sizeParts = (this.options.customIconSizeField != "") ? data[this.options.customIconSizeField].split(',') : this.options.customIconSize.split(',');
          marker_data.icon.scaledSize = new google.maps.Size(parseInt(sizeParts[0]), parseInt(sizeParts[1]));
        }
        
        marker = new google.maps.Marker(marker_data);
        marker.set('id', i);
        this.markers.push(marker);
      }
      this._setMarkerProperties();
      if(this.options.fitBounds) this.fitBounds();
    },
    
    _filterMarkers: function(){
      var i;
      for(i = 0; i < this.markers.length; i++)
      {
        this.markers[i].setVisible(this.markersToFilter.indexOf(i) == -1);
      }
    },
    
    _setMarkerProperties: function(){
      var _this = this;
      var i;
      for(i = 0; i < this.markers.length; i++)
      {
        google.maps.event.addListener(this.markers[i], 'click', function () {
          if(_this.options.onClickMarker) _this.options.onClickMarker.call(this, _this.data[this.get('id')]);
        });
      }
    },
    
    _dataFromRoot: function(data, root){
      var data = (data !== undefined)?data:this.data,
          root = (root !== undefined)?root:this.options.dataRoot,
          keys = root.split(".");
      var i;
      if(root.indexOf('.') === -1)
        return data[root];

      for(i = 0; i < keys.length; i++){
        if(!data[keys[i]]){
          console.error('the dataRoot is not correct');
          break;
        }
        data = data[keys[i]];
      }
      return data;
    }
  });

  $.fn[pluginName] = function(options) {
    var args = arguments;
    var returns, instance;
    if (options === undefined || typeof options === 'object') {
      return this.each(function() {
        if (!$.data(this, 'plugin_' + pluginName)) {
          $.data(this, 'plugin_' + pluginName, new Plugin(this, options));
        }
      });
    } else if (typeof options === 'string' && options[0] !== '_' && options !== 'init') {
      this.each(function() {
        instance = $.data(this, 'plugin_' + pluginName);
        if (instance instanceof Plugin && typeof instance[options] === 'function') {
          returns = instance[options].apply(instance, Array.prototype.slice.call(args, 1));
        }
        if (options === 'destroy') {
          $.data(this, 'plugin_' + pluginName, null);
        }
      });
      return returns !== undefined ? returns : this;
    }
  };

}(jQuery, window, document));