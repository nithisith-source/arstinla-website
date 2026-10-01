function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=utf-8"
      }
    }
  );
}


function bytesToBase64(bytes) {
  let binary = "";

  const chunkSize = 0x8000;

  for (
    let i = 0;
    i < bytes.length;
    i += chunkSize
  ) {
    binary += String.fromCharCode(
      ...bytes.subarray(
        i,
        i + chunkSize
      )
    );
  }

  return btoa(binary);
}


function textToBase64(value) {
  return bytesToBase64(
    new TextEncoder().encode(value)
  );
}


function decodeBase64(value) {
  const binary = atob(
    String(value || "").replace(/\s/g, "")
  );

  return new TextDecoder().decode(
    Uint8Array.from(
      binary,
      character => character.charCodeAt(0)
    )
  );
}


function findProjectBlock(
  source,
  projectNumber
) {
  const startPattern = new RegExp(
    `^\\s*"${projectNumber}"\\s*:\\s*\\{`,
    "m"
  );
  const startMatch = startPattern.exec(source);

  if (!startMatch) return null;

  const start = startMatch.index;
  const afterStart = start + startMatch[0].length;
  const nextMatch =
    /^\s*"\d{2}"\s*:\s*\{/m.exec(
      source.slice(afterStart)
    );
  const helperIndex = source.indexOf(
    "PROJECT HELPER FUNCTIONS",
    afterStart
  );
  const end = nextMatch
    ? afterStart + nextMatch.index
    : source.lastIndexOf(
        "\n};",
        helperIndex === -1
          ? source.length
          : helperIndex
      );

  if (end <= start) return null;

  return {
    start,
    end,
    block: source.slice(start, end)
  };
}


function readProjectArray(block, fieldName) {
  const pattern = new RegExp(
    `\\n\\s*${fieldName}\\s*:\\s*\\[([\\s\\S]*?)\\]`
  );
  const match = pattern.exec(block);

  if (!match) return [];

  return Array.from(
    match[1].matchAll(/"(?:\\.|[^"\\])*"/g),
    item => {
      try {
        return JSON.parse(item[0]);
      }
      catch {
        return "";
      }
    }
  ).filter(Boolean);
}


function upsertProjectArray(
  block,
  fieldName,
  values
) {
  const pattern = new RegExp(
    `(\\n(\\s*)${fieldName}\\s*:\\s*)` +
    `\\[[\\s\\S]*?\\]`
  );

  const renderArray = indentation =>
    values.length
      ? `[\n${values
          .map(
            value =>
              `${indentation}  ${JSON.stringify(value)}`
          )
          .join(",\n")}\n${indentation}]`
      : "[]";

  if (pattern.test(block)) {
    return block.replace(
      pattern,
      (match, prefix, indentation) =>
        prefix + renderArray(indentation)
    );
  }

  const anchor = /(\n)(\s*)previous\s*:/;

  if (!anchor.test(block)) {
    throw new Error(
      `Project field not found: ${fieldName}`
    );
  }

  return block.replace(
    anchor,
    (match, lineBreak, indentation) =>
      `${lineBreak}${indentation}${fieldName}: ` +
      `${renderArray(indentation)},` +
      `${lineBreak}${indentation}previous:`
  );
}


function cleanFileName(name) {
  return String(name || "image.jpg")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "");
}


export async function onRequestPost({
  request,
  env
}) {

  try {

    const adminKey =
      request.headers.get(
        "x-admin-key"
      );

    if (
      !env.ADMIN_KEY ||
      adminKey !== env.ADMIN_KEY
    ) {
      return json(
        {
          ok: false,
          error: "Unauthorized"
        },
        401
      );
    }


    const owner =
      env.GITHUB_OWNER;

    const repo =
      env.GITHUB_REPO;

    const branch =
      env.GITHUB_BRANCH || "main";

    const token =
      env.GITHUB_TOKEN;


    if (!owner || !repo || !token) {
      return json(
        {
          ok: false,
          error:
            "GitHub environment variables missing"
        },
        500
      );
    }


    const githubHeaders = {
      Authorization:
        `Bearer ${token}`,

      Accept:
        "application/vnd.github+json",

      "X-GitHub-Api-Version":
        "2022-11-28",

      "User-Agent":
        "ARSTINLA-Project-Manager"
    };


    const formData =
      await request.formData();

    const projectNumber =
      String(
        formData.get("projectNumber") || ""
      ).trim();

    const section =
      String(
        formData.get("section") ||
        "additional"
      ).trim();

    const sectionConfig = {
      site: {
        field: "siteImages",
        prefix: "site"
      },
      plans: {
        field: "planImages",
        prefix: "plan"
      },
      design: {
        field: "renderImages",
        prefix: "design"
      },
      construction: {
        field: "constructionImages",
        prefix: "construction"
      },
      additional: {
        field: "",
        prefix: "gallery"
      }
    }[section];


    if (!/^\d{2}$/.test(projectNumber)) {
      return json(
        {
          ok: false,
          error:
            "Invalid project number"
        },
        400
      );
    }


    if (!sectionConfig) {
      return json(
        {
          ok: false,
          error:
            "Invalid project image section"
        },
        400
      );
    }


    const uploadedFiles =
      formData.getAll("files")
        .filter(
          file =>
            file instanceof File &&
            file.size > 0
        );


    if (!uploadedFiles.length) {
      return json(
        {
          ok: false,
          error:
            "No images selected"
        },
        400
      );
    }


    const uploaded = [];


    for (const [fileIndex, file] of uploadedFiles.entries()) {

      const cleanedName =
        cleanFileName(file.name);
      const extensionMatch =
        String(file.name).match(
          /\.(jpe?g|png|webp)$/i
        );
      const extension = extensionMatch
        ? `.${extensionMatch[1].toLowerCase()}`
        : ".jpg";
      const cleanedStem = cleanedName
        .replace(/\.[^.]+$/, "")
        .replace(/[._-]/g, "");
      const safeName = cleanedStem
        ? cleanedName
        : `image-${Date.now()}-${fileIndex + 1}${extension}`;
      const fileName =
        `${sectionConfig.prefix}-${safeName}`;

      const githubPath =
        `assets/project-${projectNumber}/${fileName}`;

      const apiUrl =
        `https://api.github.com/repos/` +
        `${owner}/${repo}/contents/` +
        `${githubPath}`;


      let existingSha = null;

      const existingResponse =
        await fetch(
          `${apiUrl}?ref=${encodeURIComponent(branch)}`,
          {
            headers: githubHeaders
          }
        );


      if (existingResponse.ok) {

        const existing =
          await existingResponse.json();

        existingSha =
          existing.sha;
      }


      const bytes =
        new Uint8Array(
          await file.arrayBuffer()
        );


      const payload = {
        message:
          `Upload Project ${projectNumber} image: ${fileName}`,

        content:
          bytesToBase64(bytes),

        branch
      };


      if (existingSha) {
        payload.sha =
          existingSha;
      }


      const uploadResponse =
        await fetch(
          apiUrl,
          {
            method: "PUT",

            headers: {
              ...githubHeaders,
              "content-type":
                "application/json"
            },

            body:
              JSON.stringify(payload)
          }
        );


      if (!uploadResponse.ok) {

        const details =
          await uploadResponse.text();

        return json(
          {
            ok: false,
            error:
              `Upload failed: ${fileName}`,
            details
          },
          500
        );
      }


      uploaded.push(
        `/assets/project-${projectNumber}/${fileName}`
      );
    }


    if (sectionConfig.field) {
      const dataPath = "project-data.js";
      const dataUrl =
        `https://api.github.com/repos/` +
        `${owner}/${repo}/contents/${dataPath}`;
      const dataResponse = await fetch(
        `${dataUrl}?ref=${encodeURIComponent(branch)}`,
        { headers: githubHeaders }
      );

      if (!dataResponse.ok) {
        return json(
          {
            ok: false,
            error:
              "Images uploaded but project section could not be updated"
          },
          500
        );
      }

      const dataFile = await dataResponse.json();
      const source = decodeBase64(dataFile.content);
      const projectRange = findProjectBlock(
        source,
        projectNumber
      );

      if (!projectRange) {
        return json(
          {
            ok: false,
            error:
              `Project ${projectNumber} not found after image upload`
          },
          404
        );
      }

      const currentImages = readProjectArray(
        projectRange.block,
        sectionConfig.field
      );
      const sectionImages = Array.from(
        new Set([
          ...currentImages,
          ...uploaded
        ])
      );
      const updatedBlock = upsertProjectArray(
        projectRange.block,
        sectionConfig.field,
        sectionImages
      );
      const updatedSource =
        source.slice(0, projectRange.start) +
        updatedBlock +
        source.slice(projectRange.end);
      const updateResponse = await fetch(
        dataUrl,
        {
          method: "PUT",
          headers: {
            ...githubHeaders,
            "content-type":
              "application/json"
          },
          body: JSON.stringify({
            message:
              `Assign Project ${projectNumber} images to ${section}`,
            content:
              textToBase64(updatedSource),
            sha: dataFile.sha,
            branch
          })
        }
      );

      if (!updateResponse.ok) {
        const details =
          await updateResponse.text();
        return json(
          {
            ok: false,
            error:
              "Images uploaded but project section could not be saved",
            details
          },
          500
        );
      }
    }


    return json({
      ok: true,
      projectNumber,
      section,
      uploaded
    });

  }
  catch (error) {

    return json(
      {
        ok: false,
        error:
          error?.message ||
          "Unknown error"
      },
      500
    );
  }
}
export async function onRequestGet({
  request,
  env
}) {

  try {

    const adminKey =
      request.headers.get(
        "x-admin-key"
      );

    if (
      !env.ADMIN_KEY ||
      adminKey !== env.ADMIN_KEY
    ) {
      return json(
        {
          ok: false,
          error: "Unauthorized"
        },
        401
      );
    }

    const url =
      new URL(request.url);

    const projectNumber =
      String(
        url.searchParams.get(
          "projectNumber"
        ) || ""
      ).trim();

    if (!/^\d{2}$/.test(projectNumber)) {
      return json(
        {
          ok: false,
          error:
            "Invalid project number"
        },
        400
      );
    }

    const owner =
      env.GITHUB_OWNER;

    const repo =
      env.GITHUB_REPO;

    const branch =
      env.GITHUB_BRANCH || "main";

    const token =
      env.GITHUB_TOKEN;

    if (!owner || !repo || !token) {
      return json(
        {
          ok: false,
          error:
            "GitHub environment variables missing"
        },
        500
      );
    }

    const githubHeaders = {
      Authorization:
        `Bearer ${token}`,

      Accept:
        "application/vnd.github+json",

      "X-GitHub-Api-Version":
        "2022-11-28",

      "User-Agent":
        "ARSTINLA-Project-Manager"
    };

    const folderPath =
      `assets/project-${projectNumber}`;

    const apiUrl =
      `https://api.github.com/repos/` +
      `${owner}/${repo}/contents/` +
      `${folderPath}` +
      `?ref=${encodeURIComponent(branch)}`;

    const response =
      await fetch(
        apiUrl,
        {
          headers:
            githubHeaders
        }
      );

    if (response.status === 404) {
      return json({
        ok: true,
        projectNumber,
        files: []
      });
    }

    if (!response.ok) {

      const details =
        await response.text();

      return json(
        {
          ok: false,
          error:
            "Cannot read project folder",
          details
        },
        500
      );
    }

    const items =
      await response.json();

    const files =
      Array.isArray(items)
        ? items
            .filter(
              item =>
                item.type === "file"
            )
            .filter(
              item =>
                /\.(jpe?g|png|webp|gif)$/i
                  .test(item.name)
            )
            .map(
              item => ({
                name:
                  item.name,

                path:
                  `/assets/project-${projectNumber}/${item.name}`,

                sha:
                  item.sha
              })
            )
        : [];

    return json({
      ok: true,
      projectNumber,
      files
    });

  }
  catch (error) {

    return json(
      {
        ok: false,
        error:
          error?.message ||
          "Unknown error"
      },
      500
    );
  }
}
export async function onRequestDelete({
  request,
  env
}) {

  try {

    const adminKey =
      request.headers.get(
        "x-admin-key"
      );

    if (
      !env.ADMIN_KEY ||
      adminKey !== env.ADMIN_KEY
    ) {
      return json(
        {
          ok: false,
          error: "Unauthorized"
        },
        401
      );
    }


    const owner =
      env.GITHUB_OWNER;

    const repo =
      env.GITHUB_REPO;

    const branch =
      env.GITHUB_BRANCH || "main";

    const token =
      env.GITHUB_TOKEN;


    if (!owner || !repo || !token) {
      return json(
        {
          ok: false,
          error:
            "GitHub environment variables missing"
        },
        500
      );
    }


    const body =
      await request.json();

    const projectNumber =
      String(
        body.projectNumber || ""
      ).trim();

    const fileName =
      String(
        body.fileName || ""
      ).trim();

    const sha =
      String(
        body.sha || ""
      ).trim();


    if (!/^\d{2}$/.test(projectNumber)) {
      return json(
        {
          ok: false,
          error:
            "Invalid project number"
        },
        400
      );
    }


    if (
      !fileName ||
      fileName.includes("/") ||
      fileName.includes("\\") ||
      fileName === "." ||
      fileName === ".."
    ) {
      return json(
        {
          ok: false,
          error:
            "Invalid file name"
        },
        400
      );
    }


    if (!sha) {
      return json(
        {
          ok: false,
          error:
            "Missing file sha"
        },
        400
      );
    }


    const githubHeaders = {
      Authorization:
        `Bearer ${token}`,

      Accept:
        "application/vnd.github+json",

      "X-GitHub-Api-Version":
        "2022-11-28",

      "User-Agent":
        "ARSTINLA-Project-Manager"
    };


    const githubPath =
      `assets/project-${projectNumber}/${fileName}`;

    const apiUrl =
      `https://api.github.com/repos/` +
      `${owner}/${repo}/contents/` +
      `${githubPath}`;

    const publicPath =
      `/assets/project-${projectNumber}/${fileName}`;

    const dataPath = "project-data.js";

    const dataUrl =
      `https://api.github.com/repos/` +
      `${owner}/${repo}/contents/${dataPath}`;

    const dataResponse = await fetch(
      `${dataUrl}?ref=${encodeURIComponent(branch)}`,
      {
        headers: githubHeaders
      }
    );

    if (!dataResponse.ok) {
      return json(
        {
          ok: false,
          error:
            "Cannot update project image sections before deletion"
        },
        500
      );
    }

    const dataFile = await dataResponse.json();
    const source = decodeBase64(dataFile.content);
    const projectRange = findProjectBlock(
      source,
      projectNumber
    );

    if (!projectRange) {
      return json(
        {
          ok: false,
          error:
            `Project ${projectNumber} not found`
        },
        404
      );
    }

    const imageFields = [
      "renderImages",
      "planImages",
      "siteImages",
      "constructionImages"
    ];

    let updatedBlock = projectRange.block;
    let removedFromSection = false;

    imageFields.forEach(fieldName => {
      const currentImages = readProjectArray(
        updatedBlock,
        fieldName
      );

      const nextImages = currentImages.filter(
        imagePath => imagePath !== publicPath
      );

      if (
        nextImages.length !==
        currentImages.length
      ) {
        removedFromSection = true;
        updatedBlock = upsertProjectArray(
          updatedBlock,
          fieldName,
          nextImages
        );
      }
    });

    if (removedFromSection) {
      const updatedSource =
        source.slice(0, projectRange.start) +
        updatedBlock +
        source.slice(projectRange.end);

      const updateDataResponse = await fetch(
        dataUrl,
        {
          method: "PUT",
          headers: {
            ...githubHeaders,
            "content-type":
              "application/json"
          },
          body: JSON.stringify({
            message:
              `Remove Project ${projectNumber} image from section: ${fileName}`,
            content:
              textToBase64(updatedSource),
            sha: dataFile.sha,
            branch
          })
        }
      );

      if (!updateDataResponse.ok) {
        const details =
          await updateDataResponse.text();

        return json(
          {
            ok: false,
            error:
              "Cannot remove image from project section",
            details
          },
          500
        );
      }
    }


    const response =
      await fetch(
        apiUrl,
        {
          method: "DELETE",

          headers: {
            ...githubHeaders,
            "content-type":
              "application/json"
          },

          body:
            JSON.stringify({
              message:
                `Delete Project ${projectNumber} image: ${fileName}`,

              sha,

              branch
            })
        }
      );


    if (!response.ok) {

      const details =
        await response.text();

      return json(
        {
          ok: false,
          error:
            "Delete failed",
          details
        },
        500
      );
    }


    return json({
      ok: true,
      projectNumber,
      fileName,
      removedFromSection
    });

  }
  catch (error) {

    return json(
      {
        ok: false,
        error:
          error?.message ||
          "Unknown error"
      },
      500
    );
  }
}
