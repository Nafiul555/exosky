import * as THREE from 'three';
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';

let starData = null;
const preloader = document.getElementById('preloader');
var stars_objs = [];
var sky_group;

var ground_group;
var ground_circle;

var tube_group

var scene;
var camera;
var renderer;

var textue_loader;

var font_loader;

var sky_texture;
var sky_sphere;

var particles;

var amb_light;

var hemi_light;

var controls;

var cur_lat_deg = 32.18;

var cur_rot_rad = lat2rot(cur_lat_deg);

var rot_speed = 0.00005;

function bpRpToTemperature(bp_rp) {
    return 4600 * (1 / (0.92 * bp_rp + 1.7) + 1 / (0.92 * bp_rp + 0.62));
  }

function kelvinToRGB(kelvin) {

    let temperature = kelvin < 1000 ? 1000 : (kelvin > 40000 ? 40000 : kelvin);
    temperature = temperature / 100;

    let red, green, blue;

    if (temperature <= 66) {

        red = 255;
        green = Math.max(0, Math.min(255, 99.4708025861 * Math.log(temperature) - 161.1195681661));
        blue = temperature <= 19 ? 0 : Math.max(0, Math.min(255, 138.5177312231 * Math.log(temperature - 10) - 305.0447927307));
    } else {

        red = Math.max(0, Math.min(255, 329.698727446 * Math.pow(temperature - 60, -0.1332047592)));
        green = Math.max(0, Math.min(255, 288.1221695283 * Math.pow(temperature, -0.0755148492)));
        blue = 255; 
    }

    if (temperature >= 20 && temperature <= 40) {

        red *= 0.9; 
        green *= 1.2;
        blue *= 0.8;
    } else if (temperature > 40 && temperature <= 60) {

        red *= 1.1;
        green *= 1.1;
        blue *= 1.0;
    }

    return [Math.round(red), Math.round(green), Math.round(blue)];
}

function bp2rgb(bp_rp) {
  let temperature = bpRpToTemperature(bp_rp);
  return kelvinToRGB(temperature);
}

function lat2rot (lat) {
    return (90 - lat) / 180 * Math.PI;
}

var _VS = `
uniform vec3 baseColor;
uniform vec3 viewVector;

varying float intensity;
varying vec3 vertexNormal;
varying vec3 objPosition;

void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

    vertexNormal = normal;
    objPosition = normalize(1.0 * position);

}
`;

var _FS = `
uniform vec3 baseColor;
uniform vec3 starObjPosition;
uniform float time; 
uniform bool shouldTwinkle; 

varying vec3 objPosition;

void main() {

    float distanceFromCenter = length(objPosition - starObjPosition);

    float glowFactor = 1.0 / (distanceFromCenter * distanceFromCenter + 0.1); 

    glowFactor = clamp(glowFactor, 0.0, 0.5); 

    float twinkle = 1.0;
    if (shouldTwinkle) {
        twinkle = 0.5 + 0.7 * sin(time * 10.0 + distanceFromCenter * 15.0); 
    }

    vec3 glowColor = mix(baseColor, vec3(1.0, 1.0, 1.0), glowFactor); 

    gl_FragColor = vec4(glowColor * twinkle, 2.30); 
}
`;

function load_stars() {

    var stars = starData;
    var starcat = stars.stars;
    for (var i = 1; i < starcat.length; i++) {

        var star = starcat[i];

        var ra = ((parseFloat(star["RA"])) / 360) * 2 * Math.PI;
        var de = ((parseFloat(star["DE"])) / 360) * 2 * Math.PI;

        var vmag = parseFloat(star["mag"]).toFixed(2);

        var sx = 9000 * Math.cos(de) * Math.cos(ra);
        var sy = 9000 * Math.cos(de) * Math.sin(ra);
        var sz = 9000 * Math.sin(de);

        if (isNaN(sx) || isNaN(sy) || isNaN(sz)) {
            console.log("Star data missing/malformed: " + star["name"] + ": " + sx + ", " + sy + ", " + sz);
            continue;
        }

        var size = parseFloat(star["size"]);
        var minSize = 5; 
        var maxSize = 350; 

        var osize = minSize + (maxSize - minSize) * size;

        var geometry = new THREE.SphereGeometry(osize, 36, 36);

        var shouldTwinkle = Math.random() < 0.2;

        var bv = parseFloat(star["bv"]);
        var st_color = bp2rgb(bv);

        var material = new THREE.ShaderMaterial({
            uniforms: {
                baseColor: { value: new THREE.Color(st_color[0], st_color[1], st_color[2]) },
                starObjPosition: { value: new THREE.Vector3(sy, sz, sx) },
                time: { value: 0.0 },
                shouldTwinkle: { value: shouldTwinkle }, 
            },
            vertexShader: _VS,
            fragmentShader: _FS,
            transparent: true,
            blending: THREE.AdditiveBlending,
        });

        var starMesh = new THREE.Mesh(geometry, material);

        var normalizedPos = new THREE.Vector3(sy, sz, sx).normalize().multiplyScalar(9000);
        starMesh.position.set(normalizedPos.x, normalizedPos.y, normalizedPos.z);

        starMesh.originalPosition = starMesh.position.clone(); 

        starMesh.starData = {
            Id: star["name"],
            RA: star["RA"],
            DE: star["DE"],
            bv: star["bv"],
            mag: star["mag"],
            osize: osize
        };

        sky_group.add(starMesh);
        stars_objs.push(starMesh);
    }
    console.log("Star VMag:", vmag, "Calculated Size:", osize);
}

`function rot_speed_change (evnt) {
    var value = evnt.target.value;
    rot_speed = value / 10000;
}

function set_lat_pressed() {
    var value = document.getElementById("lat").value;

    if (value > 90) {
        value = 90;
    } else if (value < -90) {
        value = -90;
    }

    var new_rot = lat2rot(value);

    var rot_diff = new_rot - cur_rot_rad;

    axis_polar.applyAxisAngle(unit_i, rot_diff);

    sky_group.rotateOnWorldAxis(unit_i, rot_diff);

    cur_rot_rad = new_rot;
}`

let composer
let originalSkyRotation = new THREE.Quaternion();
let originalTubeRotation = new THREE.Quaternion();

async function indexjs_setup() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 150000);

    textue_loader = new THREE.TextureLoader();
    `font_loader = new THREE.FontLoader();`

    renderer = new THREE.WebGLRenderer({"antialias": true});
    renderer.setSize(window.innerWidth, window.innerHeight);

    renderer.shadowMap.enabled = true;

    document.body.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);

    controls.enablePan = false;
    controls.enableZoom = false;

    amb_light = new THREE.AmbientLight(0x909090);
    scene.add(amb_light);

    hemi_light = new THREE.HemisphereLight(0x21266e, 0x080820, 0.2);
    scene.add(hemi_light);

    camera.position.z = -0.01;

    sky_group = new THREE.Group();
    tube_group = new THREE.Group(); 

    originalSkyRotation.copy(sky_group.quaternion);
    originalTubeRotation.copy(tube_group.quaternion);

(async function fetchData() {
    const id = (window.location.pathname.split('/').filter(segment => segment).pop()) || "1";
  try {
    const response = await fetch("https://spaceapi.ndmcbd.com/files/"+id+".json");

    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    starData = await response.json();
    load_stars(); 
    preloader.style.display = 'none';
  } catch (error) {
    console.error("Failed to fetch the JSON data:", error);
  }
})();

    scene.add(sky_group);
    scene.add(tube_group);

    sky_group.rotateOnWorldAxis(unit_i, cur_rot_rad);

    initPostProcessing();

    animate();

    `document.getElementById("rot-speed").addEventListener("input", rot_speed_change);
    document.getElementById("set-lat").addEventListener("click", set_lat_pressed);`
}

var raycaster = new THREE.Raycaster();
var mouse = new THREE.Vector2();

document.addEventListener('mousedown', onClick, false);

let clickPositions = [];  
let isRotation = true;
document.addEventListener('DOMContentLoaded', function() {

    const toggleRotationBtn = document.getElementById('toggleRotationBtn');

    toggleRotationBtn.addEventListener('click', function() {

        isRotation = !isRotation;

        if (isRotation) {
            toggleRotationBtn.textContent = 'Draw Constellation';
        } else {

            sky_group.quaternion.copy(originalSkyRotation);
            tube_group.quaternion.copy(originalTubeRotation);

            toggleRotationBtn.textContent = 'Stop Drawing';
        }
    });
});

function onClick(event) {
    if (!isRotation){

    const canvasBounds = renderer.domElement.getBoundingClientRect();

    mouse.x = ((event.clientX - canvasBounds.left) / canvasBounds.width) * 2 - 1;
    mouse.y = -((event.clientY - canvasBounds.top) / canvasBounds.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(stars_objs, true);
    if (intersects.length > 0) {

        const clickedStar = new THREE.Vector3();
        intersects[0].object.getWorldPosition(clickedStar);
        clickPositions.push(clickedStar.clone());

        console.log(clickPositions);

        if (clickPositions.length === 2) {
            drawTubeBetweenStars(clickPositions[0], clickPositions[1]);
            clickPositions = [];  

        }
    }
    }
}

function drawTubeBetweenStars(star1, star2) {
    if (!star1 || !star2) {
        console.error('One or both stars are undefined:', star1, star2);
        return;
    }

    const startPoint = star1.clone();
    const endPoint = star2.clone();

    console.log('Drawing tube from', startPoint, 'to', endPoint);

    const curve = new THREE.LineCurve3(startPoint, endPoint);

    const geometry = new THREE.TubeGeometry(curve, 30, 20, 8, false);

    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: false });

    const tube = new THREE.Mesh(geometry, material);

    tube_group.add(tube);

    console.log("Tube drawn between points!");

    composer.render();
}

function update() {
    if(isRotation) {
        sky_group.rotateOnWorldAxis(axis_polar, -rot_speed);
        tube_group.rotateOnWorldAxis(axis_polar, -rot_speed);
    }
}

function initPostProcessing() {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.03, 
        0.3, 
        1.00 
    );
    composer.addPass(bloomPass);
}

function showStarInfo(starData) {

    const starInfoDiv = document.getElementById('star-info');

    document.getElementById('app').style.cursor = 'pointer'; 

    starInfoDiv.innerHTML = `
        <strong>Star Info:</strong><br>
        Star Id: ${starData.Id}<br>
        RA: ${starData.RA}<br>

        DE: ${starData.DE}<br>
        BV: ${starData.bv}<br>
        Mag: ${starData.mag}<br>
        Size: ${starData.osize}<br>
    `;

    starInfoDiv.style.left = `${mouseX + 15}px`;
    starInfoDiv.style.top = `${mouseY + 15}px`;

    starInfoDiv.style.display = 'block';

}

function hideStarInfo() {
    const starInfoDiv = document.getElementById('star-info');
    starInfoDiv.style.display = 'none';
    document.getElementById('app').style.cursor = "default"; 

}

let mouseX = 0;
let mouseY = 0;

window.addEventListener('mousemove', function(event) {
    mouseX = event.clientX;
    mouseY = event.clientY;

    const canvasBounds = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - canvasBounds.left) / canvasBounds.width) * 2 - 1;
    mouse.y = -((event.clientY - canvasBounds.top) / canvasBounds.height) * 2 + 1;
});

var frames_per_sec = 60;

var unit_i = new THREE.Vector3(1, 0, 0);
var unit_j = new THREE.Vector3(0, 1, 0);
var unit_k = new THREE.Vector3(0, 0, 1);

var axis_polar = unit_j.clone();
axis_polar.applyAxisAngle(unit_i, cur_rot_rad);

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    update();

    controls.update();

    const delta = clock.getDelta();
    stars_objs.forEach(star => {
        star.material.uniforms.time.value += delta;
    });

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(stars_objs, true);

    if (intersects.length > 0) {

        const starObject = intersects[0].object;

        if (starObject.starData) {

            showStarInfo(starObject.starData, intersects[0].point);  
        }
    } else {

        hideStarInfo();
    }

    composer.render();
}

function window_resize() {
    renderer.setSize( window.innerWidth, window.innerHeight );
    camera.aspect = window.innerWidth / window.innerHeight;
}

document.addEventListener("DOMContentLoaded", indexjs_setup);
window.addEventListener('resize', window_resize);

document.getElementById('screenshotBtn').addEventListener('click', takeScreenshotPNG);

function takeScreenshotPNG() {

    const screenshotCanvas = document.createElement('canvas');
    screenshotCanvas.width = window.innerWidth;
    screenshotCanvas.height = window.innerHeight;

    const screenshotRenderer = new THREE.WebGLRenderer({ 
        canvas: screenshotCanvas, 
        antialias: true,
        preserveDrawingBuffer: true 
    });
    screenshotRenderer.setSize(screenshotCanvas.width, screenshotCanvas.height);

    screenshotRenderer.render(scene, camera);

    const dataURL = screenshotCanvas.toDataURL('image/png');

    const link = document.createElement('a');
    link.href = dataURL;
    link.download = 'Snapshot'+ new Date().toISOString().slice(0, 19).replace('T', ' ');'.png'; 

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function takeScreenshot() {

    const screenshotCanvas = document.createElement('canvas');
    screenshotCanvas.width = window.innerWidth;
    screenshotCanvas.height = window.innerHeight;

    const screenshotRenderer = new THREE.WebGLRenderer({ 
        canvas: screenshotCanvas, 
        antialias: true,
        preserveDrawingBuffer: true 
    });
    screenshotRenderer.setSize(screenshotCanvas.width, screenshotCanvas.height);

    screenshotRenderer.render(scene, camera);

    return screenshotCanvas.toDataURL('image/png'); 
}

document.getElementById('downloadPDF').addEventListener('click', downloadPDF);

function downloadPDF() {
    const imgData = takeScreenshot(); 

    const img = new Image();
    img.src = imgData;

    img.onload = function() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const pdfWidth = window.innerWidth;
        const pdfHeight = window.innerHeight;
        canvas.width = pdfWidth;
        canvas.height = pdfHeight;

        ctx.drawImage(img, 0, 0, pdfWidth, pdfHeight);

        const imageData = ctx.getImageData(0, 0, pdfWidth, pdfHeight);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            data[i] = 255 - data[i];     
            data[i + 1] = 255 - data[i + 1]; 
            data[i + 2] = 255 - data[i + 2]; 

        }

        ctx.putImageData(imageData, 0, 0);

        const invertedImgData = canvas.toDataURL('image/png');

        const pdf = new window.jspdf.jsPDF({
            orientation: pdfWidth > pdfHeight ? 'landscape' : 'portrait',
            unit: 'px',
            format: [pdfWidth, pdfHeight],
            putOnlyUsedFonts: true,
            floatPrecision: 16 
        });

        pdf.addImage(invertedImgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

        pdf.save('Snapshot' + new Date().toISOString().slice(0, 19).replace('T', ' ') + '.pdf');
    };
}

const menuButton = document.getElementById('menu-button');
const menu = document.getElementById('menu');

menuButton.addEventListener('mouseenter', () => {
    menu.classList.add('active'); 
});

menuButton.addEventListener('mouseleave', () => {
    setTimeout(() => {
        if (!menu.matches(':hover')) {
            menu.classList.remove('active');
        }
    }, 200);
});

const chatBox = document.getElementById('chat-box');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const messagesDiv = document.getElementById('messages');
const typingIndicator = document.getElementById('typing-indicator');
const aiButton = document.getElementById('ai-button');
const closeChatButton = document.getElementById('close-chat');

aiButton.addEventListener('click', () => {
    chatBox.style.display = chatBox.style.display === 'none' || chatBox.style.display === '' ? 'block' : 'none';
});

closeChatButton.addEventListener('click', () => chatBox.style.display = 'none');

let chatHistory = JSON.parse(localStorage.getItem('chatHistory')) || [];
renderMessages(chatHistory);

sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const userMessage = messageInput.value.trim();
    if (userMessage === '') return;

    appendMessage(userMessage, 'user-message');
    messageInput.value = '';
    chatHistory.push({ message: userMessage, type: 'user-message' });
    localStorage.setItem('chatHistory', JSON.stringify(chatHistory));

    typingIndicator.style.display = 'block';

    const formData = new FormData();
    formData.append('message', userMessage); 

    fetch('https://spaceapi.ndmcbd.com/ai/chat.php', {
        method: 'POST',
        body: formData 
    })
    .then(response => response.json())
    .then(data => {
        typingIndicator.style.display = 'none';

        appendMessage(data, 'ai-message');
        chatHistory.push({ message: data, type: 'ai-message' });
        localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
    })

}

function appendMessage(message, type) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', type);
    messageDiv.textContent = message;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function renderMessages(history) {
    history.forEach(msg => appendMessage(msg.message, msg.type));
}