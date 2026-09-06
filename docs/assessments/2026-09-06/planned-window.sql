WITH candidate AS (
          SELECT * FROM events WHERE departure>=128868 AND departure<130668
          UNION SELECT * FROM events WHERE arrival>=128868 AND arrival<130668
        ) SELECT e.*,sd.day,sd.base,sa.area,r.line,r.mode,r.agency
        FROM candidate e
        JOIN trips t ON t.feed=e.feed AND t.id=e.trip_id
        JOIN service_days sd ON sd.feed=t.feed AND sd.service_id=t.service_id AND sd.day='20260905'
        JOIN stop_areas sa ON sa.feed=e.feed AND sa.stop_id=e.stop_id
        JOIN routes r ON r.feed=t.feed AND r.id=t.route_id;

WITH candidate AS (
          SELECT * FROM events WHERE departure>=42468 AND departure<44268
          UNION SELECT * FROM events WHERE arrival>=42468 AND arrival<44268
        ) SELECT e.*,sd.day,sd.base,sa.area,r.line,r.mode,r.agency
        FROM candidate e
        JOIN trips t ON t.feed=e.feed AND t.id=e.trip_id
        JOIN service_days sd ON sd.feed=t.feed AND sd.service_id=t.service_id AND sd.day='20260906'
        JOIN stop_areas sa ON sa.feed=e.feed AND sa.stop_id=e.stop_id
        JOIN routes r ON r.feed=t.feed AND r.id=t.route_id;
