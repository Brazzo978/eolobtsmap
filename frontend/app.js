const imagery = L.esri.basemapLayer('Imagery');
const labels = L.esri.basemapLayer('ImageryLabels');
const hybrid = L.layerGroup([imagery, labels]);
const standard = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap',
  maxZoom: 19
});
const map = L.map('map', { layers: [hybrid] }).setView([45.4642, 9.1900], 13);
L.control.layers({
  'Hybrid (sat+etichette)': hybrid,
  'Stradale (OSM)': standard
}).addTo(map);

// Ensure the map resizes with the browser window
window.addEventListener('resize', () => {
  map.invalidateSize();
});

// Login modal handling and auth UI
const loginLink = document.getElementById('loginLink');
const logoutLink = document.getElementById('logoutLink');
const adminLink = document.getElementById('adminLink');
const loginModal = document.getElementById('loginModal');
const loginForm = document.getElementById('loginForm');
if (loginLink && loginModal && loginForm) {
  loginLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginModal.classList.add('show');
  });
  document.getElementById('cancelLogin').addEventListener('click', () => {
    loginModal.classList.remove('show');
  });
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUser').value;
    const password = document.getElementById('loginPass').value;
    fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error('Login failed');
        }
        return res.json();
      })
      .then((data) => {
        localStorage.setItem('token', data.token);
        loginModal.classList.remove('show');
        updateUI();
      })
      .catch(() => alert('Login fallito'));
  });
}

if (logoutLink) {
  logoutLink.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('token');
    updateUI();
  });
}

function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch (e) {
    return null;
  }
}

function updateUI() {
  const token = localStorage.getItem('token');
  if (token) {
    loginLink.style.display = 'none';
    logoutLink.style.display = 'inline';
    const payload = parseJwt(token);
    if (payload && payload.role === 'admin') {
      adminLink.style.display = 'inline';
    } else {
      adminLink.style.display = 'none';
    }
  } else {
    loginLink.style.display = 'inline';
    logoutLink.style.display = 'none';
    adminLink.style.display = 'none';
  }
}
updateUI();

// Password reset handling
const resetModal = document.getElementById('resetModal');
const resetForm = document.getElementById('resetForm');
const forgotPass = document.getElementById('forgotPass');
if (forgotPass) {
  forgotPass.addEventListener('click', (e) => {
    e.preventDefault();
    loginModal.classList.remove('show');
    resetModal.classList.add('show');
  });
  document.getElementById('cancelReset').addEventListener('click', () => {
    resetModal.classList.remove('show');
  });
  resetForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('resetEmail').value;
    fetch('/auth/request-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).then(() => {
      resetModal.classList.remove('show');
      alert('Email inviata se l\'indirizzo esiste');
    });
  });
}

// Search functionality
const searchBtn = document.getElementById('searchBtn');
const searchInput = document.getElementById('searchInput');
function handleSearch() {
  const query = searchInput.value.trim();
  if (!query) return;
  const coordMatch = query.match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[2]);
    map.setView([lat, lng], 15);
    L.marker([lat, lng]).addTo(map);
  } else {
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
      .then((res) => res.json())
      .then((results) => {
        if (results && results.length) {
          const lat = parseFloat(results[0].lat);
          const lng = parseFloat(results[0].lon);
          map.setView([lat, lng], 15);
        } else {
          alert('Nessun risultato trovato');
        }
      })
      .catch(() => alert('Errore di ricerca'));
  }
}
if (searchBtn && searchInput) {
  searchBtn.addEventListener('click', handleSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  });
}

const markersById = {};
const modal = document.getElementById('markerModal');
const form = document.getElementById('markerForm');

fetch('/markers')
  .then((response) => {
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    return response.json();
  })
  .then((markers) => {
    markers.forEach((marker) => {
      addMarker(marker);
    });
  })
  .catch((err) => {
    console.error('Failed to load markers', err);
  });

map.on('click', (e) => {
  const token = localStorage.getItem('token');
  if (!token) {
    loginModal.classList.add('show');
    return;
  }
  openModal({ lat: e.latlng.lat, lng: e.latlng.lng, images: [] });
});

document.getElementById('cancelModal').addEventListener('click', () => {
  modal.classList.remove('show');
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('markerId').value;
  const marker = {
    nome: document.getElementById('markerName').value,
    descrizione: document.getElementById('markerDesc').value,
    lat: parseFloat(document.getElementById('markerLat').value),
    lng: parseFloat(document.getElementById('markerLng').value),
    images: [],
  };
  if (id) {
    marker.id = Number(id);
    if (markersById[id]) {
      marker.images = markersById[id].data.images || [];
    }
  }
  const method = id ? 'PUT' : 'POST';
  const url = id ? `/markers/${id}` : '/markers';
  fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + localStorage.getItem('token'),
    },
    body: JSON.stringify(marker),
  })
    .then((res) => {
      if (!res.ok) {
        throw new Error('Request failed');
      }
      return res.json().catch(() => ({}));
    })
    .then((data) => {
      modal.classList.remove('show');
      if (id) {
        const existing = markersById[id];
        existing.data.nome = marker.nome;
        existing.data.descrizione = marker.descrizione;
        existing.data.lat = marker.lat;
        existing.data.lng = marker.lng;
        existing.marker.setLatLng([marker.lat, marker.lng]);
        existing.marker.setPopupContent(createPopupContent(existing.data));
      } else {
        marker.id = data.id;
        addMarker(marker);
      }
    })
    .catch((err) => console.error(err));
});

function addMarker(marker) {
  if (!marker.images) marker.images = [];
  const leafletMarker = L.marker([marker.lat, marker.lng], { draggable: true }).addTo(map);
  leafletMarker.bindPopup(createPopupContent(marker));
  leafletMarker.on('popupopen', () => {
    attachPopupEvents(marker, leafletMarker);
  });
  leafletMarker.on('dragend', () => {
    const pos = leafletMarker.getLatLng();
    marker.lat = pos.lat;
    marker.lng = pos.lng;
    saveMarker(marker);
  });
  markersById[marker.id] = { data: marker, marker: leafletMarker };
}

function attachPopupEvents(marker, leafletMarker) {
  const popup = leafletMarker.getPopup().getElement();
  popup.querySelector('.edit-marker').addEventListener('click', () => {
    if (!localStorage.getItem('token')) {
      loginModal.classList.add('show');
      return;
    }
    openModal(marker);
  });
  popup.querySelector('.delete-marker').addEventListener('click', () => {
    if (!localStorage.getItem('token')) {
      loginModal.classList.add('show');
      return;
    }
    if (confirm('Eliminare questo marker?')) {
      fetch(`/markers/${marker.id}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + localStorage.getItem('token') },
      }).then((res) => {
        if (res.ok) {
          map.removeLayer(leafletMarker);
          delete markersById[marker.id];
        }
      });
    }
  });
  popup.querySelectorAll('.delete-image').forEach((btn) => {
    const imageId = btn.dataset.imageId;
    btn.addEventListener('click', () => {
      if (!localStorage.getItem('token')) {
        loginModal.classList.add('show');
        return;
      }
      if (confirm('Eliminare questa immagine?')) {
        fetch(`/markers/${marker.id}/images/${imageId}`, {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + localStorage.getItem('token') },
        }).then((res) => {
            if (res.ok) {
              marker.images = marker.images.filter(
                (img) => String(img.id) !== String(imageId)
              );
              leafletMarker.setPopupContent(createPopupContent(marker));
              leafletMarker.openPopup();
            }
        });
      }
    });
  });
}

function openModal(marker) {
  document.getElementById('markerId').value = marker.id || '';
  document.getElementById('markerName').value = marker.nome || '';
  document.getElementById('markerDesc').value = marker.descrizione || '';
  document.getElementById('markerLat').value = marker.lat;
  document.getElementById('markerLng').value = marker.lng;
  modal.classList.add('show');
}

function saveMarker(marker) {
  fetch(`/markers/${marker.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + localStorage.getItem('token'),
    },
    body: JSON.stringify(marker),
  }).catch((err) => console.error('Update failed', err));
}

function createPopupContent(marker) {
  let html = '';
  if (marker.nome) {
    html += `<h3>${marker.nome}</h3>`;
  }
  if (marker.descrizione) {
    html += `<p>${marker.descrizione}</p>`;
  }
  if (Array.isArray(marker.images) && marker.images.length) {
    html += '<div class="popup-images">';
    marker.images.forEach((img) => {
      const caption = img.didascalia ? `alt="${img.didascalia}"` : '';
      html += `<div><img src="${img.url}" ${caption}/><button class="delete-image" data-image-id="${img.id}">Elimina immagine</button></div>`;
    });
    html += '</div>';
  }
  html +=
    '<button class="edit-marker">Modifica</button> <button class="delete-marker">Elimina</button>';
  return html;
}
