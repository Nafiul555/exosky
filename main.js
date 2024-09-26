// the code for 3D rendering
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

//the texture loader
var textue_loader;
//the font loader
var font_loader;

//the sky sphere with the milky way as the background
var sky_texture;
var sky_sphere;

// the particles
var particles;
//ambient light
var amb_light;
//the hemisphere light
var hemi_light;

//the control for the camera
var controls;

//the latitude we're currently on (in degrees)
var cur_lat_deg = 32.18;
//corresping to this object rotation
var cur_rot_rad = lat2rot(cur_lat_deg);

//the speed at which the sky dome rotates
var rot_speed = 0.00005;


// Function to estimate temperature from BP-RP
function bpRpToTemperature(bp_rp) {
    return 4600 * (1 / (0.92 * bp_rp + 1.7) + 1 / (0.92 * bp_rp + 0.62));
  }
  
function kelvinToRGB(kelvin) {
// Clamp the temperature to the range 1000K to 40000K
    let temperature = kelvin < 1000 ? 1000 : (kelvin > 40000 ? 40000 : kelvin);
    temperature = temperature / 100;

    let red, green, blue;

    if (temperature <= 66) {
        // Cooler stars, reddish/orange hue
        red = 255;
        green = Math.max(0, Math.min(255, 99.4708025861 * Math.log(temperature) - 161.1195681661));
        blue = temperature <= 19 ? 0 : Math.max(0, Math.min(255, 138.5177312231 * Math.log(temperature - 10) - 305.0447927307));
    } else {
        // Hotter stars, blue/white hue
        red = Math.max(0, Math.min(255, 329.698727446 * Math.pow(temperature - 60, -0.1332047592)));
        green = Math.max(0, Math.min(255, 288.1221695283 * Math.pow(temperature, -0.0755148492)));
        blue = 255; // Strong blue component for hot stars
    }

    // Custom tweaks for mid-range stars to ensure variety
    if (temperature >= 20 && temperature <= 40) {
        // Transition from red to yellow
        red *= 0.9; 
        green *= 1.2;
        blue *= 0.8;
    } else if (temperature > 40 && temperature <= 60) {
        // Transition from yellow to white
        red *= 1.1;
        green *= 1.1;
        blue *= 1.0;
    }

    return [Math.round(red), Math.round(green), Math.round(blue)];
}

  
// Combined function to convert BP-RP to RGB
function bp2rgb(bp_rp) {
  let temperature = bpRpToTemperature(bp_rp);
  return kelvinToRGB(temperature);
}


//geo latitude to in program skydome rotation
function lat2rot (lat) {
    return (90 - lat) / 180 * Math.PI;
}

//the glsl code for the shaders
//vertex shader
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
    
    //vec3 vNormal = normalize( normalMatrix * normal );
    //vec3 vNormel = normalize( normalMatrix * viewVector );
    //intensity = pow( dot(vNormal, vNormel), 1.5 );

    //vec3 actual_normal = vec3(modelMatrix * vec4(normal, 0.0));
    //intensity = pow( dot(normalize(viewVector), actual_normal), 2.0 );
}
`;
//fragment shader
var _FS = `
uniform vec3 baseColor;
uniform vec3 starObjPosition;
uniform float time; // Add time uniform for twinkling
uniform bool shouldTwinkle; // Flag to control twinkling

varying vec3 objPosition;

void main() {
    // Calculate distance from the star's position to simulate glow
    float distanceFromCenter = length(objPosition - starObjPosition);
    
    // Attenuate the glow intensity with distance (avoid division by zero)
    float glowFactor = 1.0 / (distanceFromCenter * distanceFromCenter + 0.1); // Adjust attenuation factor (0.1) to control glow spread
    
    // Clamp to ensure glowFactor doesn't become too strong
    glowFactor = clamp(glowFactor, 0.0, 0.5); // This prevents too much glow intensity

    // Calculate twinkle effect only if shouldTwinkle is true
    float twinkle = 1.0;
    if (shouldTwinkle) {
        twinkle = 0.5 + 0.7 * sin(time * 10.0 + distanceFromCenter * 15.0); // Twinkling effect
    }

    // Combine the glow with the base color and twinkle factor
    vec3 glowColor = mix(baseColor, vec3(1.0, 1.0, 1.0), glowFactor); // Mix with white for the glow effect

    // Set the final fragment color with twinkle effect applied
    gl_FragColor = vec4(glowColor * twinkle, 2.30); // Use twinkle to affect brightness
}
`;




//for rendering the stars 
// For rendering the stars 
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
        var vmag = parseFloat(star["mag"]).toFixed(2);
        
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
        var minSize = 5; // Minimum size for faint stars
        var maxSize = 350; // Maximum size for bright stars
        

        // Use a steeper scaling factor for vmag differences
        var osize = minSize + (maxSize - minSize) * size;





        



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







//when the rotation speed slider is changed
`function rot_speed_change (evnt) {
    var value = evnt.target.value;
    rot_speed = value / 10000;
}
//when the set lat button is pressed
function set_lat_pressed() {
    var value = document.getElementById("lat").value;

    //clamp to +-90
    if (value > 90) {
        value = 90;
    } else if (value < -90) {
        value = -90;
    }

    //the new rotation
    var new_rot = lat2rot(value);
    
    //calculate the differnce and rotate that amount
    var rot_diff = new_rot - cur_rot_rad;

    axis_polar.applyAxisAngle(unit_i, rot_diff);
    //sky_group.rotateOnAxis(unit_i, rot_diff);
    sky_group.rotateOnWorldAxis(unit_i, rot_diff);
    
    //update value
    cur_rot_rad = new_rot;
}`

let composer
let originalSkyRotation = new THREE.Quaternion();
let originalTubeRotation = new THREE.Quaternion();

    
async function indexjs_setup() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 150000);
    
    //create the loaders
    textue_loader = new THREE.TextureLoader();
    `font_loader = new THREE.FontLoader();`
    
    renderer = new THREE.WebGLRenderer({"antialias": true});
    renderer.setSize(window.innerWidth, window.innerHeight);
    //enable shadows
    renderer.shadowMap.enabled = true;
    //add to document
    document.body.appendChild(renderer.domElement);
    
    controls = new OrbitControls(camera, renderer.domElement);
    //disable zooming and panning (can only look in different directions)
    controls.enablePan = false;
    controls.enableZoom = false;
    
    //an ambient light
    amb_light = new THREE.AmbientLight(0x909090);
    scene.add(amb_light);
    
    //the hemisphere light
    hemi_light = new THREE.HemisphereLight(0x21266e, 0x080820, 0.2);
    scene.add(hemi_light);
    

    
    //set camera position
    //camera.position.x = 1;
    //camera.lookAt(-1,0,0);
    camera.position.z = -0.01;

    

    
    //create the group object
    //the next functions will add objects to it
    sky_group = new THREE.Group();
    tube_group = new THREE.Group(); // Ensure this is created

    // Store original rotations
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


    //add the objects to the scene
    scene.add(sky_group);
    scene.add(tube_group);

    

    

    //rotate whole sky dome to emulate earth on requested lattitude
    //sky_group.rotateOnAxis(unit_i, cur_rot_rad);
    sky_group.rotateOnWorldAxis(unit_i, cur_rot_rad);

    initPostProcessing();


    animate();
    
    //set the controls' event listener
    `document.getElementById("rot-speed").addEventListener("input", rot_speed_change);
    document.getElementById("set-lat").addEventListener("click", set_lat_pressed);`
}


//chatGPT

var raycaster = new THREE.Raycaster();
var mouse = new THREE.Vector2();


document.addEventListener('mousedown', onClick, false);

let clickPositions = [];  // To store the 3D positions of two clicks
let isRotation = true;
document.addEventListener('DOMContentLoaded', function() {
    // Initialize the rotation variable

    // Get the button element
    const toggleRotationBtn = document.getElementById('toggleRotationBtn');

    // Add a click event listener to the button
    toggleRotationBtn.addEventListener('click', function() {
        // Toggle the isRotation variable
        isRotation = !isRotation;

        // Update the button label based on the current state
        if (isRotation) {
            toggleRotationBtn.textContent = 'Draw Constellation';
        } else {
            // Reset both groups to their original rotation
            sky_group.quaternion.copy(originalSkyRotation);
            tube_group.quaternion.copy(originalTubeRotation);

            toggleRotationBtn.textContent = 'Done';
        }
    });
});

//draws line by clicking on the stars
function onClick(event) {
    if (!isRotation){
    // Get the bounding rectangle of the renderer's DOM element (the canvas)
    const canvasBounds = renderer.domElement.getBoundingClientRect();

    // Calculate mouse position relative to the canvas/container
    mouse.x = ((event.clientX - canvasBounds.left) / canvasBounds.width) * 2 - 1;
    mouse.y = -((event.clientY - canvasBounds.top) / canvasBounds.height) * 2 + 1;

    // Update the raycaster with camera and mouse
    raycaster.setFromCamera(mouse, camera);

    // Check for intersected objects in the scene
    const intersects = raycaster.intersectObjects(stars_objs, true);
    if (intersects.length > 0) {
        // Get the world position of the clicked star
        const clickedStar = new THREE.Vector3();
        intersects[0].object.getWorldPosition(clickedStar);
        clickPositions.push(clickedStar.clone());

        console.log(clickPositions);

        // If we have two click positions, draw the tube
        if (clickPositions.length === 2) {
            drawTubeBetweenStars(clickPositions[0], clickPositions[1]);
            clickPositions = [];  // Reset for the next set of clicks
            
        }
    }
    }
}

//stops the rotation after one star is clicked, resumes after two stars are clicked and tubes added to the scene




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

function update() {
    if(isRotation) {
        sky_group.rotateOnWorldAxis(axis_polar, -rot_speed);
        tube_group.rotateOnWorldAxis(axis_polar, -rot_speed);
    }
}




//for the sun-like glow effect
function initPostProcessing() {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.03, // Strength(by the time i wrote done these were 0.5, 0.8, 1)
        0.3, // Radius
        1.00 // Threshold
    );
    composer.addPass(bloomPass);
}


// Function to show star information when hovering
// Function to show star information when hovering
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
    document.getElementById('app').style.cursor = "default"; 

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

    // Check for intersections (hovering)
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

    // Render the scene
    composer.render();
}




function window_resize() {
    renderer.setSize( window.innerWidth, window.innerHeight );
    camera.aspect = window.innerWidth / window.innerHeight;
}





document.addEventListener("DOMContentLoaded", indexjs_setup);
window.addEventListener('resize', window_resize);




