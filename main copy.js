async function main() {
  // Get A WebGL context
  /** @type {HTMLCanvasElement} */
  const canvas = document.querySelector("#canvas");
  const gl = canvas.getContext("webgl");
  if (!gl) {
    return;
  }

  const Program = webglUtils.createProgramInfo(gl, [vertexShaderSource, fragmentShaderSource]);

  const objHref = 'mejmon.obj';  
  const response = await fetch(objHref);
  const text = await response.text();
  
  const obj = parseOBJ(text);
  const baseHref = new URL(objHref, window.location.href);
  const matTexts = await Promise.all(obj.materialLibs.map(async filename => {
    const matHref = new URL(filename, baseHref).href;
    const response = await fetch(matHref);
    return await response.text();
  }));
  const materials = parseMTL(matTexts.join('\n'));

  const textures = {
    defaultWhite: create1PixelTexture(gl, [255, 255, 255, 255]),
  };

  for (const material of Object.values(materials)) {
    Object.entries(material)
      .filter(([key]) => key.endsWith('Map'))
      .forEach(([key, filename]) => {
        let texture = textures[filename];
        console.log(filename);
        if (!texture) {
          const textureHref = "wood.jpg";
          texture = createTexture(gl, textureHref);
          textures[filename] = texture;
        }
        material[key] = texture;
      });
  }

  Object.values(materials).forEach(m => {
    m.shininess = 25;
    m.specular = [1, 1, 1];
  });

  const defaultMaterial = {
    diffuse: [1, 1, 1],
    diffuseMap: textures.defaultWhite,
    ambient: [0, 0, 0],
    specular: [1, 1, 1],
    specularMap: textures.defaultWhite,
    shininess: 1000,
    opacity: 1,
  };

  const parts = obj.geometries.map(({material, data}) => {
    if (data.color) {
      if (data.position.length === data.color.length) {
        data.color = { numComponents: 3, data: data.color };
      }
    } else {
      data.color = { value: [1, 1, 1, 1] };
    }

    const bufferInfo = webglUtils.createBufferInfoFromArrays(gl, data);
    return {
      material: {
        ...defaultMaterial,
        ...materials[material],
      },
      bufferInfo,
    };
  });

  const extents = getGeometriesExtents(obj.geometries);
  const range = m4.subtractVectors(extents.max, extents.min);
  const objOffset = m4.scaleVector(
      m4.addVectors(
        extents.min,
        m4.scaleVector(range, 0.5)),
      -1);
  const cameraTarget = [0, 0, 0];
  const radius = m4.length(range) * 1.2;
  const cameraPosition = m4.addVectors(cameraTarget, [0,0,radius,]);
  const zNear = radius / 100;
  const zFar = radius * 3;

  function render(time) {
    time *= 0.001; 

    webglUtils.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.enable(gl.DEPTH_TEST);

    const fieldOfViewRadians = 60 * Math.PI / 180;
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const projection = m4.perspective(fieldOfViewRadians, aspect, zNear, zFar);

    const up = [0, 1, 0];
    const camera = m4.lookAt(cameraPosition, cameraTarget, up);

    const view = m4.inverse(camera);

    const sharedUniforms = {
      u_lightDirection: m4.normalize([-1, 3, 5]),
      u_view: view,
      u_projection: projection,
      u_viewWorldPosition: cameraPosition,
    };

    gl.useProgram(Program.program);

    webglUtils.setUniforms(Program, sharedUniforms);

    let u_world = m4.yRotation(time);
    u_world = m4.translate(u_world, ...objOffset);

    for (const {bufferInfo, material} of parts) {
      webglUtils.setBuffersAndAttributes(gl, Program, bufferInfo);
      webglUtils.setUniforms(Program, {
        u_world,
      }, material);
      webglUtils.drawBufferInfo(gl, bufferInfo);
    }

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}

main();
