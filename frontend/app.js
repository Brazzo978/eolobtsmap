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
const markerViewModal = document.getElementById('viewMarkerModal');
let currentUserRole = null;
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
    currentUserRole = payload ? payload.role : null;
    if (payload && payload.role === 'admin') {
      adminLink.style.display = 'inline';
    } else {
      adminLink.style.display = 'none';
    }
  } else {
    loginLink.style.display = 'inline';
    logoutLink.style.display = 'none';
    adminLink.style.display = 'none';
    currentUserRole = null;
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
    color: document.getElementById('markerColor').value || '#3388ff',
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
      marker.id = id ? Number(id) : data.id;
      const files = document.getElementById('markerImages').files;
      const token = localStorage.getItem('token');
      const uploads = Array.from(files).map((file) => {
        const fd = new FormData();
        fd.append('image', file);
        return fetch(`/markers/${marker.id}/images`, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token },
          body: fd,
        })
          .then((r) => {
            if (!r.ok) throw new Error('Upload failed');
            return r.json();
          })
          .then((imgData) => {
            marker.images.push(imgData);
          });
      });
      return Promise.all(uploads).then(() => {
        document.getElementById('markerImages').value = '';
        if (id) {
          const existing = markersById[id];
          existing.data = marker;
          existing.marker.setLatLng([marker.lat, marker.lng]);
          existing.marker.setIcon(createColoredIcon(marker.color));
        } else {
          addMarker(marker);
        }
        modal.classList.remove('show');
      });
    })
    .catch((err) => console.error(err));
});

function addMarker(marker) {
  if (!marker.images) marker.images = [];
  const leafletMarker = L.marker([marker.lat, marker.lng], {
    draggable: currentUserRole === 'admin' || currentUserRole === 'editor',
    icon: createColoredIcon(marker.color || '#3388ff'),
  }).addTo(map);
  leafletMarker.on('click', () => {
    openMarkerView(marker, leafletMarker);
  });
  leafletMarker.on('dragend', () => {
    const pos = leafletMarker.getLatLng();
    marker.lat = pos.lat;
    marker.lng = pos.lng;
    saveMarker(marker);
  });
  markersById[marker.id] = { data: marker, marker: leafletMarker };
}

function openModal(marker) {
  document.getElementById('markerId').value = marker.id || '';
  document.getElementById('markerName').value = marker.nome || '';
  document.getElementById('markerDesc').value = marker.descrizione || '';
  document.getElementById('markerLat').value = marker.lat;
  document.getElementById('markerLng').value = marker.lng;
  document.getElementById('markerColor').value = marker.color || '#3388ff';
  document.getElementById('markerImages').value = '';
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

function createColoredIcon(color) {
  return L.divIcon({
    className: 'custom-pin',
    html: `<span style="background:${color}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function openMarkerView(marker, leafletMarker) {
  document.getElementById('viewTitle').textContent = marker.nome || 'Marker';
  document.getElementById('viewDesc').textContent = marker.descrizione || '';
  const carousel = document.getElementById('viewCarousel');
  carousel.innerHTML = '';
  if (marker.images && marker.images.length) {
    marker.images.forEach((img) => {
      const item = document.createElement('a');
      item.className = 'carousel-item';
      item.innerHTML = `<img src="${img.url}" alt="${img.didascalia || ''}">`;
      if (currentUserRole === 'admin' || currentUserRole === 'editor') {
        const delBtn = document.createElement('button');
        delBtn.textContent = 'Elimina immagine';
        delBtn.className = 'btn red delete-image';
        delBtn.dataset.imageId = img.id;
        item.appendChild(delBtn);
      }
      carousel.appendChild(item);
    });
    M.Carousel.init(carousel);
  }
  const actions = document.getElementById('viewActions');
  actions.innerHTML = '';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Chiudi';
  closeBtn.className = 'btn';
  closeBtn.addEventListener('click', () => markerViewModal.classList.remove('show'));
  actions.appendChild(closeBtn);
  if (currentUserRole === 'admin' || currentUserRole === 'editor') {
    const editBtn = document.createElement('button');
    editBtn.textContent = 'Modifica';
    editBtn.className = 'btn';
    editBtn.style.marginLeft = '0.5rem';
    editBtn.addEventListener('click', () => {
      markerViewModal.classList.remove('show');
      openModal(marker);
    });
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Elimina pin';
    deleteBtn.className = 'btn red';
    deleteBtn.style.marginLeft = '0.5rem';
    deleteBtn.addEventListener('click', () => {
      if (confirm('Eliminare questo marker?')) {
        fetch(`/markers/${marker.id}`, {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + localStorage.getItem('token') },
        }).then((res) => {
          if (res.ok) {
            map.removeLayer(leafletMarker);
            delete markersById[marker.id];
            markerViewModal.classList.remove('show');
          }
        });
      }
    });
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
  }
  markerViewModal.classList.add('show');

  carousel.querySelectorAll('.delete-image').forEach((btn) => {
    btn.addEventListener('click', () => {
      const imageId = btn.dataset.imageId;
      if (confirm('Eliminare questa immagine?')) {
        fetch(`/markers/${marker.id}/images/${imageId}`, {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + localStorage.getItem('token') },
        }).then((res) => {
          if (res.ok) {
            marker.images = marker.images.filter((img) => String(img.id) !== String(imageId));
            markerViewModal.classList.remove('show');
            openMarkerView(marker, leafletMarker);
          }
        });
      }
    });
  });
}

markerViewModal.addEventListener('click', (e) => {
  if (e.target === markerViewModal) {
    markerViewModal.classList.remove('show');
  }
});
