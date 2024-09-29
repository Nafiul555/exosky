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
    // The catalog has a list of stars
    var stars = starData;
    var starcat = stars.stars;
    for (var i = 1; i < starcat.length; i++) {
        
        var star = starcat[i];
        
        // Right ascension and declination in radians
        var ra = ((parseFloat(star["RA"])) / 360) * 2 * Math.PI;
        var de = ((parseFloat(star["DE"])) / 360) * 2 * Math.PI;
       
        // Visual magnitude (brightness)
        var vmag = parseFloat(star["mag"]);
        
        // Calculate the xyz coordinates using spherical coordinates
        var sx = 9000 * Math.cos(de) * Math.cos(ra);
        var sy = 9000 * Math.cos(de) * Math.sin(ra);
        var sz = 9000 * Math.sin(de);
        
        if (isNaN(sx) || isNaN(sy) || isNaN(sz)) {
            console.log("Star data missing/malformed: " + star["name"] + ": " + sx + ", " + sy + ", " + sz);
            continue;
        }
        
        // Calculate the size based on visual magnitude
        // Calculate the size based on visual magnitude
        // Calculate the size based on visual magnitude
        var size = parseFloat(star["size"]);
        var minSize = 0.25; // Minimum size for faint stars
        var maxSize = 450; // Maximum size for bright stars

        // Desired scaling factors for different magnitudes
       

        var baseSize = 60; // Size for mag close to 0
        var scalingFactor = 1.1; // Control how quickly size decreases with increasing mag

        // Compute osize based on the star's magnitude
        var osize = baseSize / Math.pow(1 + vmag, scalingFactor);

        // Clamp osize between minSize and maxSize
        osize = Math.max(minSize, Math.min(osize, maxSize));

        console.log(osize);

        var geometry = new THREE.SphereGeometry(osize, 36, 36);
        
        var shouldTwinkle = Math.random() < 0.2;

        // Get the color from the BV index
        var bv = parseFloat(star["bv"]);
        var st_color = bp2rgb(bv);

        // Create material and add shouldTwinkle flag
        var material = new THREE.ShaderMaterial({
            uniforms: {
                baseColor: { value: new THREE.Color(st_color[0], st_color[1], st_color[2]) },
                starObjPosition: { value: new THREE.Vector3(sy, sz, sx) },
                time: { value: 0.0 },
                shouldTwinkle: { value: shouldTwinkle }, // Add twinkle flag
            },
            vertexShader: _VS,
            fragmentShader: _FS,
            transparent: true,
            blending: THREE.AdditiveBlending,
        });
        
        var starMesh = new THREE.Mesh(geometry, material);
        
        // Set position and add to scene
        var normalizedPos = new THREE.Vector3(sy, sz, sx).normalize().multiplyScalar(9000);
        starMesh.position.set(normalizedPos.x, normalizedPos.y, normalizedPos.z);

        //save original position on an array
        starMesh.originalPosition = starMesh.position.clone(); // Store original position
        //can use the save tecknique to save other information about the star to show on screen for 'hover'
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
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 150000);

    // Create the renderer
    renderer = new THREE.WebGLRenderer({"antialias": true});
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Initialize controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableZoom = false;  

    // Add lights
    amb_light = new THREE.AmbientLight(0x909090);
    scene.add(amb_light);
    
    hemi_light = new THREE.HemisphereLight(0x21266e, 0x080820, 0.2);
    scene.add(hemi_light);

    camera.position.z = -0.01;

    // Create groups
    sky_group = new THREE.Group();
    tube_group = new THREE.Group();
    constellation_group = new THREE.Group();

    // Store original rotations
    originalSkyRotation.copy(sky_group.quaternion);
    originalTubeRotation.copy(tube_group.quaternion);
    originalConstellationRot.copy(constellation_group.quaternion);
    
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
    scene.add(constellation_group);

    // Rotate sky group
    sky_group.rotateOnWorldAxis(unit_i, cur_rot_rad);

    // Set up the CSS2DRenderer
    labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0';
    labelRenderer.domElement.style.pointerEvents = 'none'; // Prevent blocking mouse events
    document.body.appendChild(labelRenderer.domElement);

    initPostProcessing();

    animate();

    setupZoomControls();

    `document.getElementById("rot-speed").addEventListener("input", rot_speed_change);
    document.getElementById("set-lat").addEventListener("click", set_lat_pressed);`
}

//for the sun-like glow effect
function initPostProcessing() {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.04, // Strength(by the time i wrote done these were 0.5, 0.8, 1)
        0.34, // Radius
        1.00 // Threshold
    );
    composer.addPass(bloomPass);
}


function setupZoomControls() {
    const zoomInButton = document.getElementById('zoom-in');
    const zoomOutButton = document.getElementById('zoom-out');
    
    // Set an initial field of view (FOV)
    camera.fov = 60;
    camera.updateProjectionMatrix();
    
    // Zoom in functionality
    zoomInButton.addEventListener('click', function () {
        if (camera.fov > 10) {  // Set a minimum FOV limit
            camera.fov -= 10;  // Decrease FOV to zoom in
            camera.updateProjectionMatrix();
        }
    });
    
    // Zoom out functionality
    zoomOutButton.addEventListener('click', function () {
        if (camera.fov < 100) {  // Set a maximum FOV limit
            camera.fov += 10;  // Increase FOV to zoom out
            camera.updateProjectionMatrix();
        }
    });
}

//chatGPT



var raycaster = new THREE.Raycaster();
var mouse = new THREE.Vector2();

document.addEventListener('mousedown', onClick, false);


let starsInBox = [];  // Array to store selected stars

let isRotation = true;

document.addEventListener('DOMContentLoaded', function () {
    const selectionButton = document.getElementById('selection-button');
    const selectionBox = document.getElementById('selection-box');
    let isBoxVisible = false;  // Track visibility of the box
    let isSelecting = false;  // Track whether the user is dragging to select
    let startMousePosition = new THREE.Vector2();  // Start position of the selection
    let endMousePosition = new THREE.Vector2();    // End position of the selection


    // Mouse events to track drag selection
    window.addEventListener('mousedown', (event) => {
        if (isBoxVisible) {
            isSelecting = true;
            startMousePosition.set(event.clientX, event.clientY);
            selectionBox.style.left = `${event.clientX}px`;
            selectionBox.style.top = `${event.clientY}px`;
            selectionBox.style.width = '0px';
            selectionBox.style.height = '0px';
            selectionBox.style.display = 'block';
        }
    });

    window.addEventListener('mousemove', (event) => {
        if (isSelecting) {
            // Calculate the size of the selection box while dragging
            const width = event.clientX - startMousePosition.x;
            const height = event.clientY - startMousePosition.y;
            selectionBox.style.width = `${Math.abs(width)}px`;
            selectionBox.style.height = `${Math.abs(height)}px`;

            // Adjust the position of the selection box if dragging upwards or to the left
            if (width < 0) selectionBox.style.left = `${event.clientX}px`;
            if (height < 0) selectionBox.style.top = `${event.clientY}px`;
        }
    });

    window.addEventListener('mouseup', (event) => {
        if (isSelecting) {
            isSelecting = false;
            //selectionBox.style.display = 'none';

            // Set the end position for the selection
            endMousePosition.set(event.clientX, event.clientY);

            // Perform the selection logic with the recorded start and end positions
            selectObjectsInBox(startMousePosition, endMousePosition);
        }
    });

    // Toggle the visibility of the selection box
    selectionButton.addEventListener('click', function () {
        const selectionBoxWidth = 400;
        const selectionBoxHeight = 400;

        if (isBoxVisible) {
            // Hide the selection box and finalize the selection
            selectionBox.style.display = 'none';
            isBoxVisible = false;
            controls.enabled = true;
        } else {
            // Show the selection box in the center of the screen
            controls.enabled = false;
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const centerX = (viewportWidth / 2) - (selectionBoxWidth / 2);
            const centerY = (viewportHeight / 2) - (selectionBoxHeight / 2);
            selectionBox.style.width = `${selectionBoxWidth}px`;
            selectionBox.style.height = `${selectionBoxHeight}px`;
            selectionBox.style.left = `${centerX}px`;
            selectionBox.style.top = `${centerY}px`;
            selectionBox.textContent ='Drag Select To Do Research';
            selectionBox.style.display = 'block';
            
            isBoxVisible = true;
        }
    });

    // Function to select objects inside the selection box
    function selectObjectsInBox(startPos, endPos) {
        // Convert screen coordinates to normalized device coordinates (NDC)
        const normalizedStart = new THREE.Vector2(
            (startPos.x / window.innerWidth) * 2 - 1,
            -(startPos.y / window.innerHeight) * 2 + 1
        );
        const normalizedEnd = new THREE.Vector2(
            (endPos.x / window.innerWidth) * 2 - 1,
            -(endPos.y / window.innerHeight) * 2 + 1
        );

        // Find stars inside the selection box
        starsInBox = [];
        sky_group.children.forEach(starMesh => {
            const starScreenPosition = starMesh.position.clone().project(camera);
            if (isInsideSelectionBox(starScreenPosition, normalizedStart, normalizedEnd)) {
                // Add star to the selected list
                starsInBox.push(starMesh);

                // Retrieve and log the star's information
                const starInfo = starMesh.starData;
                //console.log(`Star Name: ${starInfo.Id}`);
                
            }
        });
    }

 
    
    // Access the form and input elements
   // DOM Elements for Constellation Form
    const constellationForm = document.getElementById('constellation-form');
    const constellationInput = document.getElementById('constellation-name');
    const submitConstellationBtn = document.getElementById('submit-constellation');



    // Handle toggle rotation button for drawing constellations
    const toggleRotationBtn = document.getElementById('toggleRotationBtn');
    toggleRotationBtn.addEventListener('click', function () {
        isRotation = !isRotation;

        if (isRotation) {
            toggleRotationBtn.style.display = 'block';
            toggleRotationBtn.textContent = 'Draw Constellation';
            constellationForm.style.display = 'none';
            clickPositions = []; // Reset click positions when starting rotation
            clickedstars = [];
        } else {
            sky_group.quaternion.copy(originalSkyRotation);
            tube_group.quaternion.copy(originalTubeRotation);
            constellation_group.quaternion.copy(originalConstellationRot);
            toggleRotationBtn.style.display = '';

            // Show the constellation naming form if there are enough click positions
            
            constellationForm.style.display = 'block';       

            // Event listener for submitting the constellation name
            submitConstellationBtn.addEventListener('click', function () {
                const constellationName = constellationInput.value;
                if (constellationName.trim() !== '' && clickedstars.length > 1) {
                    // Calculate the midpoint of all clicked star positions
                    let midpoint = new THREE.Vector3(0, 0, 0);
                    clickPositions.forEach(pos => midpoint.add(pos));
                    midpoint.divideScalar(clickPositions.length); // Average of positions
                    console.log('position and stars', clickPositions, clickedstars);
            
                    createLabel(constellationName, midpoint);
            
                    // Log the constellation for debugging
                    console.log('Constellation saved:', constellationName);
            
                    // Reset the form and hide it
                    constellationInput.value = '';
                    constellationForm.style.display = 'none';
            
                    // Reset for the next constellation
                    clickPositions = [];
                    clickPosition = [];
                    clickedstars = [];
            
                    // Reset the rotation toggle button to "Draw Constellation"
                    toggleRotationBtn.style.display = 'block';
                    toggleRotationBtn.textContent = 'Draw Constellation';
                    isRotation = !isRotation;
                } else if (constellationName.trim() !== '' && clickedstars.length <= 1) {
                    constellationInput.value = '';
                    constellationForm.style.display = 'none';
            
                    // Reset for the next constellation
                    clickPositions = [];
                    clickPosition = [];
                    clickedstars = [];
            
                    // Reset the rotation toggle button to "Draw Constellation"
                    toggleRotationBtn.style.display = 'block';
                    toggleRotationBtn.textContent = 'Draw Constellation';
                    isRotation = !isRotation;
                    
                } 
            });             
        }
    });
});

function createLabel(name, position) {
    const labelDiv = document.createElement('div');
    labelDiv.className = 'label';
    labelDiv.textContent = name;
    labelDiv.style.fontSize = '34px';
    labelDiv.style.color = 'white';
    labelDiv.style.textAlign = 'center';
    labelDiv.style.pointerEvents = 'none'; // Prevent blocking mouse events

    const label = new CSS2DObject(labelDiv); 
    label.position.copy(position); // Set the position of the label in the 3D space
    constellation_group.add(label); // Add the label to the constellation group or scene
}



function isInsideSelectionBox(objectScreenPosition, normalizedStart, normalizedEnd) {
    const minX = Math.min(normalizedStart.x, normalizedEnd.x);
    const maxX = Math.max(normalizedStart.x, normalizedEnd.x);
    const minY = Math.min(normalizedStart.y, normalizedEnd.y);
    const maxY = Math.max(normalizedStart.y, normalizedEnd.y);

    return objectScreenPosition.x >= minX && objectScreenPosition.x <= maxX &&
           objectScreenPosition.y >= minY && objectScreenPosition.y <= maxY;
}

//define array to store clicked star data
let clickedstars = [];
let selectedTube = null;  // Define selectedTube globally
let clickedTubes = [];
let clickPosition = [];  // To store the 3D positions of two clicks
let clickPositions = []; // to store all the positions in the constellation

// Draw lines by clicking on the stars
function onClick(event) {
    // Get the bounding rectangle of the renderer's DOM element (the canvas)
    const canvasBounds = renderer.domElement.getBoundingClientRect();

    // Calculate mouse position relative to the canvas/container
    mouse.x = ((event.clientX - canvasBounds.left) / canvasBounds.width) * 2 - 1;
    mouse.y = -((event.clientY - canvasBounds.top) / canvasBounds.height) * 2 + 1;

    // Update the raycaster with camera and mouse
    raycaster.setFromCamera(mouse, camera);

    if (!isRotation) {
        // Check for intersected objects in the scene (stars)
        const intersects = raycaster.intersectObjects(stars_objs, true);
        if (intersects.length > 0) {
            // Get the clicked star's world position
            const clickedStar = intersects[0].object;
            const clickedpos = new THREE.Vector3();
            intersects[0].object.getWorldPosition(clickedpos);
            clickPosition.push(clickedpos.clone());
            clickPositions.push(clickedpos.clone());
            clickedstars.push(clickedStar); // Store clicked star object

            // Draw tube when two stars are selected
            if (clickPosition.length === 2) {
                drawTubeBetweenStars(clickPosition[0], clickPosition[1]);
                clickPosition[0] = clickPosition[1];
                clickPosition.pop();  // Ready for next click
                
            }
        } else {
            // Check if a tube was clicked
            const tubeIntersects = raycaster.intersectObjects(tube_group.children);
            if (tubeIntersects.length > 0) {
                selectedTube = tubeIntersects[0].object;  // Store the selected tube

                // Push the clicked tube into the clickedTubes array
                clickedTubes.push(selectedTube);

                // Check if the same tube was clicked twice
                if (clickedTubes.length >= 2 && clickedTubes[clickedTubes.length - 1] === clickedTubes[clickedTubes.length - 2]) {
                    // Remove the tube from the group
                    tube_group.remove(selectedTube);
                    selectedTube.geometry.dispose();  // Dispose the geometry to free up memory
                    selectedTube.material.dispose();  // Dispose the material to free up memory
                    selectedTube = null;  // Clear the selected tube reference
                    console.log("Tube deleted!");
                    clickedTubes = [];  // Reset the clickedTubes array
                } else if (clickedTubes.length > 2) {
                    // If more than 2 tubes are stored, remove the oldest one to limit the array to 2 elements
                    clickedTubes.shift();
                }
            }
            
        }
    } 
    console.log('clicked pos', clickPositions)
}


// Draw a tube between two stars
function drawTubeBetweenStars(star1, star2) {
    if (!star1 || !star2) {
        console.error('One or both stars are undefined:', star1, star2);
        return;
    }

    const startPoint = star1.clone();
    const endPoint = star2.clone();

    console.log('Drawing tube from', startPoint, 'to', endPoint);

    // Create a curve between the two points
    const curve = new THREE.LineCurve3(startPoint, endPoint);

    // Create a TubeGeometry, increase the radius for visibility
    const geometry = new THREE.TubeGeometry(curve, 30, 20, 8, false);

    // Basic material for visibility (can switch to wireframe for debugging)
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: false });

    const tube = new THREE.Mesh(geometry, material);


    // Add the tube to the scene

    tube_group.add(tube);

    console.log("Tube drawn between points!");

    // Re-render the scene with post-processing
    composer.render();
}

`function calculateMidpoint(curve) {
    if (curve && curve.getPoint) {
        return curve.getPoint(0.5);  // Get the midpoint of the curve
    }
    return new THREE.Vector3();  // Return a default vector if no curve
}`




// Function to show star information when hovering
function showStarInfo(starData) {
    const starInfoDiv = document.getElementById('star-info');

    // Set the star information
    starInfoDiv.innerHTML = `
        <strong>Star Info:</strong><br>
        Star Id: ${starData.Id}<br>
        RA: ${starData.RA}<br>
        DE: ${starData.DE}<br>
        BV: ${starData.bv}<br>
        Mag: ${starData.mag}<br>
        Size: ${starData.osize}<br>
    `;

    // Use the globally captured mouseX and mouseY for positioning
    starInfoDiv.style.left = `${mouseX + 15}px`;
    starInfoDiv.style.top = `${mouseY + 15}px`;

    // Show the div
    starInfoDiv.style.display = 'block';
}


// Function to hide the star information when not hovering
function hideStarInfo() {
    const starInfoDiv = document.getElementById('star-info');
    starInfoDiv.style.display = 'none';
}



let mouseX = 0;
let mouseY = 0;

window.addEventListener('mousemove', function(event) {
    mouseX = event.clientX;
    mouseY = event.clientY;

    // Update the mouse position for raycasting
    const canvasBounds = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - canvasBounds.left) / canvasBounds.width) * 2 - 1;
    mouse.y = -((event.clientY - canvasBounds.top) / canvasBounds.height) * 2 + 1;
});



// frame rate
var frames_per_sec = 60;

//the requested lattitude (default toronto, ON)
//var lat_in_rad = 43.75 / 180 * Math.PI;

var unit_i = new THREE.Vector3(1, 0, 0);
var unit_j = new THREE.Vector3(0, 1, 0);
var unit_k = new THREE.Vector3(0, 0, 1);

//vector pointing to north celestial pole
//this always rotate along with the sky group
var axis_polar = unit_j.clone();
axis_polar.applyAxisAngle(unit_i, cur_rot_rad);
//stops the world rotation so that drawing the constellations easier
function update() {
    if(isRotation) {
        sky_group.rotateOnWorldAxis(axis_polar, -rot_speed);
        tube_group.rotateOnWorldAxis(axis_polar, -rot_speed);
        constellation_group.rotateOnWorldAxis(axis_polar, -rot_speed);
    }
}



const clock = new THREE.Clock();


function animate() {
    requestAnimationFrame(animate);

    // Rotate the sky group
    update();

    // Update orbit controls
    controls.update();

    // Update the time for twinkling stars
    const delta = clock.getDelta();
    stars_objs.forEach(star => {
        star.material.uniforms.time.value += delta;
    });

    // Raycaster for hover detection
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(stars_objs, true);

    // Check for intersections (hovering over stars)
    if (intersects.length > 0) {
        // Get the intersected star and access its starData
        const starObject = intersects[0].object;
        
        if (starObject.starData) {
            // Show the star info using the starData attached to the star object
            showStarInfo(starObject.starData, intersects[0].point);  // Pass the star data
        }
    } else {
        // Hide the star info if not hovering over any star
        hideStarInfo();
    }

    // Check for intersections with tubes (hovering over tubes)
    const tubeIntersects = raycaster.intersectObjects(tube_group.children);



    const delete_instruction = document.getElementById('delete');
    if (!isRotation) {
        if (tubeIntersects.length > 0) {  
            delete_instruction.left = `${mouseX + 15}px`;
            delete_instruction.top = `${mouseY + 15}px`;
            delete_instruction.style.display = 'block';  // Show the delete instruction
            console.log('showing delete instruction')
        } else {
            delete_instruction.style.display = 'none';  // Hide the delete instruction
        }
    
    }
    
    // Render the scene
    composer.render();
    labelRenderer.render(scene, camera);
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
