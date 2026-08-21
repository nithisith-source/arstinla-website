// Force redeploy after updating LINE secrets
export async function onRequestPost(context) {

  const {
    request,
    env
  } = context;


  const jsonHeaders = {
    "Content-Type":
      "application/json; charset=UTF-8"
  };


  /* =========================================
     CHECK SECRETS
  ========================================= */

  if (
    !env.LINE_CHANNEL_ACCESS_TOKEN ||
    !env.LINE_USER_ID
  ) {

    console.error(
      "LINE secrets are missing"
    );

    return new Response(
      JSON.stringify({
        ok: false,
        error: "Server configuration error"
      }),
      {
        status: 500,
        headers: jsonHeaders
      }
    );
  }


  /* =========================================
     READ FORM DATA
  ========================================= */

  let data;

  try {

    data =
      await request.json();

  } catch (error) {

    return new Response(
      JSON.stringify({
        ok: false,
        error: "Invalid request"
      }),
      {
        status: 400,
        headers: jsonHeaders
      }
    );
  }


  /* =========================================
     SIMPLE ANTI-SPAM
  ========================================= */

  if (data.website) {

    return new Response(
      JSON.stringify({
        ok: true
      }),
      {
        status: 200,
        headers: jsonHeaders
      }
    );
  }


  /* =========================================
     CLEAN INPUT
  ========================================= */

  const clean =
    (value, max = 500) =>
      String(value ?? "")
        .trim()
        .slice(0, max);


  const name =
    clean(data.name, 100);

  const contactInfo =
    clean(data.contactInfo, 150);

  const province =
    clean(data.province, 100);

  const land =
    clean(data.land, 100);

  const area =
    clean(data.area, 100);

  const budget =
    clean(data.budget, 100);

  const bedroom =
    clean(data.bedroom, 100);

  const timeline =
    clean(data.timeline, 100);

  const detail =
    clean(data.detail, 1000);


  /* =========================================
     REQUIRED FIELDS
  ========================================= */

  if (
    !name ||
    !contactInfo
  ) {

    return new Response(
      JSON.stringify({
        ok: false,
        error:
          "กรุณากรอกชื่อและช่องทางติดต่อ"
      }),
      {
        status: 400,
        headers: jsonHeaders
      }
    );
  }


  /* =========================================
     LINE MESSAGE
  ========================================= */

  const message = `📐 ARSTINLA — PROJECT INQUIRY

มีลูกค้าส่งข้อมูลโครงการใหม่

ชื่อ:
${name}

LINE / เบอร์โทร:
${contactInfo}

จังหวัดที่ก่อสร้าง:
${province || "-"}

สถานะที่ดิน:
${land || "-"}

พื้นที่บ้านโดยประมาณ:
${area || "-"}

งบก่อสร้างโดยประมาณ:
${budget || "-"}

จำนวนห้องนอน:
${bedroom || "-"}

ต้องการเริ่มเมื่อไร:
${timeline || "-"}

รายละเอียด:
${detail || "-"}

──────────────
ส่งจาก arstinla.com`;


  /* =========================================
     SEND TO LINE
  ========================================= */

  try {

    const lineResponse =
      await fetch(
        "https://api.line.me/v2/bot/message/push",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "Authorization":
              `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`
          },

          body: JSON.stringify({

            to:
              env.LINE_USER_ID,

            messages: [
              {
                type: "text",
                text: message
              }
            ]

          })
        }
      );


    if (!lineResponse.ok) {

      const lineError =
        await lineResponse.text();

      console.error(
        "LINE API error:",
        lineResponse.status,
        lineError
      );

      return new Response(
        JSON.stringify({
          ok: false,
          error:
            "Unable to send LINE notification"
        }),
        {
          status: 502,
          headers: jsonHeaders
        }
      );
    }


    return new Response(
      JSON.stringify({
        ok: true
      }),
      {
        status: 200,
        headers: jsonHeaders
      }
    );


  } catch (error) {

    console.error(
      "LINE request failed:",
      error
    );

    return new Response(
      JSON.stringify({
        ok: false,
        error:
          "Notification service unavailable"
      }),
      {
        status: 500,
        headers: jsonHeaders
      }
    );
  }

}
