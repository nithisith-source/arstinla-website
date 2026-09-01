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


function decodeBase64(value) {
  const binary = atob(
    value.replace(/\n/g, "")
  );

  const bytes =
    Uint8Array.from(
      binary,
      char => char.charCodeAt(0)
    );

  return new TextDecoder()
    .decode(bytes);
}


function safeString(value) {
  return JSON.stringify(
    String(value || "")
  );
}


export async function onRequestPost({
  request,
  env
}) {

  try {

    /* ------------------------------
       ADMIN AUTH
    ------------------------------ */

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


    /* ------------------------------
       FORM DATA
    ------------------------------ */

    const formData =
      await request.formData();

    const title =
      String(
        formData.get("title") || ""
      ).trim();

    const category =
      String(
        formData.get("category") || ""
      ).trim();

    const location =
      String(
        formData.get("location") || ""
      ).trim();

    const slug =
      String(
        formData.get("slug") || ""
      )
        .trim()
        .toLowerCase();

    const cover =
      formData.get("cover");


    if (!title || !category || !slug) {
      return json(
        {
          ok: false,
          error:
            "Missing required fields"
        },
        400
      );
    }


    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/
        .test(slug)
    ) {
      return json(
        {
          ok: false,
          error: "Invalid slug"
        },
        400
      );
    }


    if (
      !(cover instanceof File) ||
      cover.size === 0
    ) {
      return json(
        {
          ok: false,
          error:
            "Cover image is required"
        },
        400
      );
    }


    /* ------------------------------
       GITHUB SETTINGS
    ------------------------------ */

    const owner =
      env.GITHUB_OWNER;

    const repo =
      env.GITHUB_REPO;

    const branch =
      env.GITHUB_BRANCH || "main";

    const token =
      env.GITHUB_TOKEN;


    if (
      !owner ||
      !repo ||
      !token
    ) {
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


    /* ------------------------------
       READ project-data.js
    ------------------------------ */

    const dataUrl =
      `https://api.github.com/repos/` +
      `${owner}/${repo}/contents/` +
      `project-data.js` +
      `?ref=${encodeURIComponent(branch)}`;


    const dataResponse =
      await fetch(
        dataUrl,
        {
          headers: githubHeaders
        }
      );


if (!dataResponse.ok) {

  const details =
    await dataResponse.text();

  return json(
    {
      ok: false,
      error:
        "Cannot read project-data.js",
      status:
        dataResponse.status,
      details
    },
    500
  );
}
    const dataFile =
  await dataResponse.json();
const source =
  decodeBase64(
    dataFile.content
  );
    /* ------------------------------
       NEXT PROJECT NUMBER
    ------------------------------ */

    const numbers = [
      ...source.matchAll(
        /^\s*"(\d{2})"\s*:\s*\{/gm
      )
    ].map(
      match =>
        Number(match[1])
    );


    const nextNumber =
      String(
        (Math.max(0, ...numbers) + 1)
      ).padStart(2, "0");


    const coverWebPath =
      `/assets/project-${nextNumber}.jpg`;

    const assetFolder =
      `/assets/project-${nextNumber}/`;


    /* ------------------------------
       CATEGORY LABEL
    ------------------------------ */

    const categoryLabels = {
      residential:
        "Residential",

      commercial:
        "Commercial",

      public:
        "Public & Institutional",

      urban:
        "Urban",

      interior:
        "Interior"
    };


    const categoryLabel =
      categoryLabels[category] ||
      category;


    /* ------------------------------
       BUILD PROJECT DATA
    ------------------------------ */

    const projectBlock = `
  "${nextNumber}": {

    number: ${safeString(nextNumber)},

    slug: ${safeString(slug)},

    url:
      ${safeString(`/projects/${slug}/`)},

    title:
      ${safeString(title)},

    officialTitle:
      ${safeString(title)},

    category:
      ${safeString(categoryLabel)},

    filterCategory:
      ${safeString(category)},

    location:
      ${safeString(location)},

    province: "",

    country:
      "Thailand",

    year: "",

    completion: "",

    area: "",

    areaNumber: 0,

    status:
      "Draft",

    service:
      "Architecture / Design",

    thumbnail:
      ${safeString(coverWebPath)},

    hero:
      ${safeString(coverWebPath)},

    heroAlt:
      ${safeString(title)},

    assetFolder:
      ${safeString(assetFolder)},

    siteImages: [],

    planImages: [],

    constructionImages: [],

    previous: null,

    next: null

  }`;


    /* ------------------------------
       FIND DATABASE END

       PROJECT HELPER FUNCTIONS
       อยู่หลัง database
    ------------------------------ */

    const helperIndex =
      source.indexOf(
        "PROJECT HELPER FUNCTIONS"
      );


    if (helperIndex === -1) {
      return json(
        {
          ok: false,
          error:
            "Project helper marker not found"
        },
        500
      );
    }


    const objectCloseIndex =
      source.lastIndexOf(
        "\n};",
        helperIndex
      );


    if (objectCloseIndex === -1) {
      return json(
        {
          ok: false,
          error:
            "Project database closing not found"
        },
        500
      );
    }


    const before =
      source
        .slice(
          0,
          objectCloseIndex
        )
        .replace(/\s*$/, "");


    const after =
      source.slice(
        objectCloseIndex
      );


    const updatedSource =
      `${before},\n\n` +
      `${projectBlock}\n` +
      `${after}`;


    /* ------------------------------
       UPLOAD COVER IMAGE
    ------------------------------ */

    const coverBytes =
      new Uint8Array(
        await cover.arrayBuffer()
      );


    const coverGithubPath =
      `assets/project-${nextNumber}.jpg`;


    const coverUploadUrl =
      `https://api.github.com/repos/` +
      `${owner}/${repo}/contents/` +
      `${coverGithubPath}`;
let existingCoverSha = null;

const existingCoverResponse =
  await fetch(
    `${coverUploadUrl}?ref=${encodeURIComponent(branch)}`,
    {
      headers: githubHeaders
    }
  );

if (existingCoverResponse.ok) {
  const existingCover =
    await existingCoverResponse.json();

  existingCoverSha =
    existingCover.sha;
}

const coverPayload = {
  message:
    `Add Project ${nextNumber} cover image`,

  content:
    bytesToBase64(
      coverBytes
    ),

  branch
};

if (existingCoverSha) {
  coverPayload.sha =
    existingCoverSha;
}

const coverUpload = 
  await fetch(
    coverUploadUrl,
    {
      method: "PUT",

      headers: {
        ...githubHeaders,
        "content-type":
          "application/json"
      },

      body:
        JSON.stringify(
          coverPayload
        )
    }
  );
    if (!coverUpload.ok) {

      const details =
        await coverUpload.text();

      return json(
        {
          ok: false,
          error:
            "Cover upload failed",
          details
        },
        500
      );
    }


    /* ------------------------------
       UPDATE project-data.js
    ------------------------------ */

    const updatedBytes =
      new TextEncoder()
        .encode(updatedSource);


    const updateResponse =
      await fetch(
        `https://api.github.com/repos/` +
        `${owner}/${repo}/contents/` +
        `project-data.js`,
        {
          method: "PUT",

          headers: {
            ...githubHeaders,
            "content-type":
              "application/json"
          },

          body: JSON.stringify({
            message:
              `Add Project ${nextNumber}: ${title}`,

            content:
              bytesToBase64(
                updatedBytes
              ),

            sha:
              dataFile.sha,

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
            "project-data.js update failed",
          details
        },
        500
      );
    }


    return json({
      ok: true,
      number: nextNumber,
      title,
      slug,
      category,
      cover: coverWebPath
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
