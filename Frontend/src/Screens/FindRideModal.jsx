import React, { useState } from 'react';
import { useLoadScript, GoogleMap, Autocomplete } from '@react-google-maps/api';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import './FindRideModal.css';

const libraries = ['places'];
const mapContainerStyle = {
  width: '100%',
  height: '300px'
};
const center = {
  lat: 17.3850, // Default center (Hyderabad)
  lng: 78.4867
};

const FindRideModal = ({ isOpen, onClose, community }) => {
  const [destination, setDestination] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [autocomplete, setAutocomplete] = useState(null);

  const { isLoaded } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries
  });

  const onLoad = (autoC) => setAutocomplete(autoC);
  const onPlaceChanged = () => {
    if (autocomplete !== null) {
      const place = autocomplete.getPlace();
      setDestination(place.formatted_address);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!destination || !date || !time) return;

    setIsSearching(true);
    try {
      const ridesRef = collection(db, 'rides');
      const q = query(
        ridesRef,
        where('community', '==', community),
        where('destination', '==', destination),
        where('date', '==', date),
        where('time', '>=', time) // Rides after selected time
      );
      
      const querySnapshot = await getDocs(q);
      const rides = [];
      querySnapshot.forEach((doc) => {
        rides.push({ id: doc.id, ...doc.data() });
      });
      
      setResults(rides);
    } catch (error) {
      console.error('Error searching rides:', error);
    } finally {
      setIsSearching(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="find-ride-modal">
        <div className="modal-header">
          <h2>Find a Ride</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-content">
          <form onSubmit={handleSearch} className="search-form">
            <div className="form-group">
              <label>Source (Fixed)</label>
              <input
                type="text"
                value={community}
                disabled
                className="disabled-input"
              />
            </div>

            <div className="form-group">
              <label>Destination</label>
              {isLoaded ? (
                <Autocomplete
                  onLoad={onLoad}
                  onPlaceChanged={onPlaceChanged}
                >
                  <input
                    type="text"
                    placeholder="Enter destination..."
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    required
                  />
                </Autocomplete>
              ) : (
                <input
                  type="text"
                  placeholder="Loading maps..."
                  disabled
                />
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>

              <div className="form-group">
                <label>Time</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                />
              </div>
            </div>

            <button type="submit" disabled={isSearching} className="search-btn">
              {isSearching ? 'Searching...' : 'Search Rides'}
            </button>
          </form>

          {isLoaded && (
            <div className="map-preview">
              <GoogleMap
                mapContainerStyle={mapContainerStyle}
                zoom={12}
                center={center}
              />
            </div>
          )}

          {results.length > 0 && (
            <div className="results-section">
              <h3>Available Rides ({results.length})</h3>
              <div className="ride-results">
                {results.map(ride => (
                  <RideCard key={ride.id} ride={ride} onClose={onClose} />
                ))}
              </div>
            </div>
          )}

          {results.length === 0 && !isSearching && destination && (
            <div className="no-results">
              <p>No rides found for your criteria</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FindRideModal;